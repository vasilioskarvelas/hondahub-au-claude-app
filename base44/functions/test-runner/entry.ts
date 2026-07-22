import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    const requireAdmin = async () => {
      const user = await base44.auth.me();
      if (!user) throw new Error('Unauthorized');
      if (user.role !== 'admin') throw new Error('Forbidden — admin only');
      return base44.asServiceRole;
    };

    // ─── REPORT: receive test results & bugs from external Playwright runner ───
    if (action === 'report') {
      const b = await requireAdmin();
      const { results, bugs, run_id } = body;
      const runId = run_id || `run-${Date.now()}`;
      let resultsSaved = 0;
      let bugsSaved = 0;

      if (Array.isArray(results)) {
        for (const r of results) {
          await b.entities.TestResult.create({
            run_id: runId,
            test_suite: r.test_suite || 'unknown',
            test_name: r.test_name || 'unnamed',
            status: r.status || 'pass',
            test_account: r.test_account || '',
            device: r.device || '',
            viewport: r.viewport || '',
            page_url: r.page_url || '',
            duration_ms: r.duration_ms || 0,
            error_message: r.error_message || '',
            console_errors: r.console_errors || [],
            screenshot_url: r.screenshot_url || '',
            actions: r.actions || '',
          });
          resultsSaved++;
        }
      }

      if (Array.isArray(bugs)) {
        for (const bug of bugs) {
          await b.entities.Bug.create({
            title: bug.title || 'Untitled bug',
            severity: bug.severity || 'medium',
            status: 'open',
            test_suite: bug.test_suite || '',
            test_account: bug.test_account || '',
            device: bug.device || '',
            viewport: bug.viewport || '',
            page_url: bug.page_url || '',
            actions_performed: bug.actions_performed || '',
            expected_result: bug.expected_result || '',
            actual_result: bug.actual_result || '',
            error_message: bug.error_message || '',
            console_errors: bug.console_errors || [],
            screenshot_url: bug.screenshot_url || '',
            assigned_agent: bug.assigned_agent || '',
            run_id: runId,
          });
          bugsSaved++;
        }
      }

      return Response.json({ success: true, run_id: runId, results_saved: resultsSaved, bugs_saved: bugsSaved });
    }

    // ─── SMOKE: run database-level smoke tests ───
    if (action === 'smoke') {
      const b = await requireAdmin();
      const runId = `smoke-${Date.now()}`;
      const results = [];
      const errors = [];

      const testEntity = async (entityName, label) => {
        const start = Date.now();
        try {
          const items = await b.entities[entityName].list("-created_date", 5);
          results.push({
            test_suite: 'db_smoke',
            test_name: `list_${label}`,
            status: 'pass',
            duration_ms: Date.now() - start,
            actions: `Fetch 5 ${label}`,
          });
          return items;
        } catch (e) {
          results.push({
            test_suite: 'db_smoke',
            test_name: `list_${label}`,
            status: 'fail',
            duration_ms: Date.now() - start,
            error_message: e.message,
            actions: `Fetch 5 ${label}`,
          });
          errors.push(`${label}: ${e.message}`);
          return [];
        }
      };

      const listings = await testEntity('Listing', 'listings');
      await testEntity('CommunityPost', 'posts');
      await testEntity('Event', 'events');
      await testEntity('GarageCar', 'garage_cars');
      await testEntity('Offer', 'offers');
      await testEntity('Conversation', 'conversations');
      await testEntity('Notification', 'notifications');
      await testEntity('Story', 'stories');

      // Data integrity: listings with missing required fields
      try {
        const allListings = await b.entities.Listing.list("-created_date", 50);
        const missingTitle = allListings.filter(l => !l.title).length;
        const missingPrice = allListings.filter(l => l.price === null || l.price === undefined).length;
        const missingState = allListings.filter(l => !l.state).length;
        const missingCount = missingTitle + missingPrice + missingState;
        results.push({
          test_suite: 'db_smoke',
          test_name: 'listing_data_integrity',
          status: missingCount === 0 ? 'pass' : 'fail',
          error_message: missingCount > 0 ? `Missing: ${missingTitle} titles, ${missingPrice} prices, ${missingState} states` : '',
          actions: `Check ${allListings.length} listings for missing required fields`,
        });
      } catch (e) {
        results.push({ test_suite: 'db_smoke', test_name: 'listing_data_integrity', status: 'fail', error_message: e.message });
      }

      // Orphaned offers: listing_id references non-existent listing
      try {
        const allListings = await b.entities.Listing.list("-created_date", 100);
        const listingIds = new Set(allListings.map(l => l.id));
        const allOffers = await b.entities.Offer.list("-created_date", 100);
        const orphaned = allOffers.filter(o => o.listing_id && !listingIds.has(o.listing_id));
        results.push({
          test_suite: 'db_smoke',
          test_name: 'orphaned_offers',
          status: orphaned.length === 0 ? 'pass' : 'fail',
          error_message: orphaned.length > 0 ? `${orphaned.length} offers reference non-existent listings` : '',
          actions: `Check ${allOffers.length} offers for orphaned references`,
        });
      } catch (e) {
        results.push({ test_suite: 'db_smoke', test_name: 'orphaned_offers', status: 'fail', error_message: e.message });
      }

      // Save results
      for (const r of results) {
        await b.entities.TestResult.create({ ...r, run_id: runId, device: 'server', viewport: 'n/a', page_url: 'n/a' });
      }

      const passed = results.filter(r => r.status === 'pass').length;
      const failed = results.filter(r => r.status === 'fail').length;

      // Auto-create bugs for failures
      for (const r of results.filter(r => r.status === 'fail')) {
        await b.entities.Bug.create({
          title: `[DB Smoke] ${r.test_name} failed`,
          severity: 'high',
          status: 'open',
          test_suite: 'db_smoke',
          error_message: r.error_message || '',
          actions_performed: r.actions || '',
          page_url: 'n/a',
          run_id: runId,
          assigned_agent: 'database',
        });
      }

      return Response.json({ success: true, run_id: runId, total: results.length, passed, failed, results, errors });
    }

    // ─── CLEANUP: delete test data ───
    if (action === 'cleanup') {
      const b = await requireAdmin();
      const deleted = { listings: 0, posts: 0, events: 0, garage_cars: 0, offers: 0, comments: 0, messages: 0 };

      const isTestContent = (text) => text && (text.startsWith("TEST_") || text.includes("[AUTOMATED TEST]"));

      const allListings = await b.entities.Listing.list("-created_date", 200);
      for (const l of allListings.filter(l => isTestContent(l.title))) { await b.entities.Listing.delete(l.id); deleted.listings++; }

      const allPosts = await b.entities.CommunityPost.list("-created_date", 200);
      for (const p of allPosts.filter(p => isTestContent(p.caption))) { await b.entities.CommunityPost.delete(p.id); deleted.posts++; }

      const allEvents = await b.entities.Event.list("-created_date", 200);
      for (const e of allEvents.filter(e => isTestContent(e.title))) { await b.entities.Event.delete(e.id); deleted.events++; }

      const allCars = await b.entities.GarageCar.list("-created_date", 200);
      for (const c of allCars.filter(c => isTestContent(c.model))) { await b.entities.GarageCar.delete(c.id); deleted.garage_cars++; }

      const allOffers = await b.entities.Offer.list("-created_date", 200);
      for (const o of allOffers.filter(o => isTestContent(o.message) || (o.buyer_name || "").startsWith("TEST_"))) { await b.entities.Offer.delete(o.id); deleted.offers++; }

      const allComments = await b.entities.Comment.list("-created_date", 200);
      for (const c of allComments.filter(c => isTestContent(c.text))) { await b.entities.Comment.delete(c.id); deleted.comments++; }

      const allMsgs = await b.entities.Message.list("-created_date", 200);
      for (const m of allMsgs.filter(m => isTestContent(m.text))) { await b.entities.Message.delete(m.id); deleted.messages++; }

      return Response.json({ success: true, deleted });
    }

    // ─── STATS: dashboard summary ───
    if (action === 'stats') {
      const b = await requireAdmin();
      const results = await b.entities.TestResult.list("-created_date", 200);
      const bugs = await b.entities.Bug.list("-created_date", 200);

      const passed = results.filter(r => r.status === 'pass').length;
      const failed = results.filter(r => r.status === 'fail').length;
      const running = results.filter(r => r.status === 'running').length;
      const criticalBugs = bugs.filter(bug => bug.severity === 'critical' && bug.status !== 'resolved').length;
      const openBugs = bugs.filter(bug => bug.status !== 'resolved' && bug.status !== 'wont_fix').length;

      const suiteStats = {};
      for (const r of results) {
        const key = r.test_suite || 'unknown';
        if (!suiteStats[key]) suiteStats[key] = { total: 0, passed: 0, failed: 0 };
        suiteStats[key].total++;
        if (r.status === 'pass') suiteStats[key].passed++;
        if (r.status === 'fail') suiteStats[key].failed++;
      }

      return Response.json({
        total_tests: results.length,
        passed,
        failed,
        running,
        critical_bugs: criticalBugs,
        open_bugs: openBugs,
        suite_stats: suiteStats,
        latest_run: results[0]?.run_id || null,
        latest_time: results[0]?.created_date || null,
      });
    }

    return Response.json({ error: 'Unknown action. Use: report, smoke, cleanup, stats' }, { status: 400 });
  } catch (error) {
    console.error('test-runner error:', error);
    const status = error.message.includes('Unauthorized') ? 401 : error.message.includes('Forbidden') ? 403 : 500;
    return Response.json({ error: error.message }, { status });
  }
});