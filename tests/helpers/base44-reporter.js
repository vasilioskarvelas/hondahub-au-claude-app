/**
 * Custom Playwright reporter that sends test results to Honda Hub's backend.
 *
 * Results are stored in the TestResult and Bug entities and visible in the
 * Testing Command Centre admin page.
 *
 * The reporter batches results per test run and sends them via the browser
 * page context (using the admin user's session) to the test-runner function.
 */
const { TEST_ACCOUNTS, generateRunId } = require('./test-data');

class Base44Reporter {
  constructor(options) {
    this.results = [];
    this.bugs = [];
    this.runId = generateRunId();
    this.startTime = Date.now();
  }

  onTestEnd(test, result) {
    const suite = test.titlePath()[1] || 'unknown';
    const testSuite = this._mapSuite(suite);
    const status = result.status; // 'passed', 'failed', 'timedOut', 'skipped'
    const device = result.parallelIndex === 0 ? 'desktop' : 'mobile';
    const viewport = result.viewport || '';

    const testResult = {
      test_suite: testSuite,
      test_name: test.title,
      status: status === 'passed' ? 'pass' : status === 'skipped' ? 'skipped' : 'fail',
      device,
      viewport: JSON.stringify(viewport),
      duration_ms: result.duration || 0,
      error_message: result.error?.message || '',
      console_errors: result.stderr || [],
      page_url: '',
      actions: test.titlePath().join(' > '),
      test_account: TEST_ACCOUNTS.user1?.displayName || 'TEST_user',
      run_id: this.runId,
    };

    this.results.push(testResult);

    // Auto-create bug for failures
    if (testResult.status === 'fail') {
      this.bugs.push({
        title: test.title,
        severity: this._assessSeverity(test.title, result.error?.message),
        test_suite: testSuite,
        test_account: testResult.test_account,
        device,
        viewport: testResult.viewport,
        page_url: '',
        actions_performed: test.titlePath().join(' > '),
        expected_result: 'Test should pass',
        actual_result: result.error?.message || 'Test failed',
        error_message: result.error?.message || '',
        console_errors: testResult.console_errors,
        screenshot_url: result.attachments?.find((a) => a.name === 'screenshot')?.path || '',
        run_id: this.runId,
        assigned_agent: this._assignAgent(testSuite),
      });
    }
  }

  async onEnd(result) {
    const totalDuration = Date.now() - this.startTime;
    console.log(`\n════════════════════════════════════════`);
    console.log(`  Test Run: ${this.runId}`);
    console.log(`  Total: ${this.results.length}`);
    console.log(`  Passed: ${this.results.filter((r) => r.status === 'pass').length}`);
    console.log(`  Failed: ${this.results.filter((r) => r.status === 'fail').length}`);
    console.log(`  Bugs: ${this.bugs.length}`);
    console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`════════════════════════════════════════\n`);

    // Results are also sent per-page during test execution via reportResults().
    // This reporter logs to console. For automatic upload, use the reportResults
    // helper inside test specs (it runs in browser context with auth).
  }

  _mapSuite(suiteName) {
    const map = {
      account: 'account', social: 'social', marketplace: 'marketplace',
      events: 'events', garage: 'garage', navigation: 'navigation',
      exploratory: 'exploratory', edge: 'edge_cases', 'edge-cases': 'edge_cases',
    };
    return map[suiteName] || 'navigation';
  }

  _assessSeverity(testName, errorMessage) {
    if (testName.match(/login|register|auth|password|security|payment|checkout/i)) return 'critical';
    if (errorMessage?.match(/Cannot read|undefined is not|TypeError|crash/i)) return 'high';
    if (testName.match(/layout|style|visual|spacing|colour|color/i)) return 'low';
    return 'medium';
  }

  _assignAgent(suite) {
    const map = {
      account: 'security',
      social: 'app_developer',
      marketplace: 'app_developer',
      events: 'app_developer',
      garage: 'app_developer',
      navigation: 'ui_ux',
      exploratory: 'qa_testing',
      edge_cases: 'qa_testing',
      db_smoke: 'database',
    };
    return map[suite] || 'qa_testing';
  }
}

module.exports = Base44Reporter;