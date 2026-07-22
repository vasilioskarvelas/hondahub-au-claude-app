import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });

    const b = base44.asServiceRole;
    const body = await req.json();
    const { operation, entity, record_id, data, records, query, ids } = body;

    // Validate entity name
    const validEntities = [
      'Listing', 'CommunityPost', 'Comment', 'Offer', 'Bid',
      'User', 'Profile', 'Notification', 'Follow', 'Conversation',
      'Message', 'Event', 'Giveaway', 'GiveawayEntry', 'GarageCar',
      'Story', 'PartnerDiscount', 'Report'
    ];

    if (!entity || !validEntities.includes(entity)) {
      return Response.json({
        success: false,
        error: `Invalid entity: ${entity}. Must be one of: ${validEntities.join(', ')}`
      }, { status: 400 });
    }

    const entityApi = b.entities[entity];

    // SINGLE CREATE
    if (operation === 'create') {
      if (!data) {
        return Response.json({ success: false, error: 'data is required for create' }, { status: 400 });
      }
      const result = await entityApi.create(data);
      console.log(`[data-manager] Created ${entity}: ${result.id}`);
      return Response.json({ success: true, result });
    }

    // SINGLE UPDATE
    if (operation === 'update') {
      if (!record_id || !data) {
        return Response.json({ success: false, error: 'record_id and data are required for update' }, { status: 400 });
      }
      const result = await entityApi.update(record_id, data);
      console.log(`[data-manager] Updated ${entity}: ${record_id}`);
      return Response.json({ success: true, result });
    }

    // SINGLE DELETE
    if (operation === 'delete') {
      if (!record_id) {
        return Response.json({ success: false, error: 'record_id is required for delete' }, { status: 400 });
      }
      await entityApi.delete(record_id);
      console.log(`[data-manager] Deleted ${entity}: ${record_id}`);
      return Response.json({ success: true, deleted: record_id });
    }

    // BULK CREATE
    if (operation === 'bulk_create') {
      if (!records || !Array.isArray(records) || records.length === 0) {
        return Response.json({ success: false, error: 'records array is required for bulk_create' }, { status: 400 });
      }
      const results = [];
      for (const record of records) {
        try {
          const result = await entityApi.create(record);
          results.push({ success: true, id: result.id });
          console.log(`[data-manager] Bulk created ${entity}: ${result.id}`);
        } catch (err) {
          results.push({ success: false, error: err.message, data: record });
          console.error(`[data-manager] Bulk create error for ${entity}:`, err.message);
        }
      }
      return Response.json({
        success: true,
        created: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      });
    }

    // BULK UPDATE
    if (operation === 'bulk_update') {
      if (!records || !Array.isArray(records) || records.length === 0) {
        return Response.json({ success: false, error: 'records array (with id + data) is required for bulk_update' }, { status: 400 });
      }
      const results = [];
      for (const record of records) {
        if (!record.id) {
          results.push({ success: false, error: 'Record missing id field' });
          continue;
        }
        try {
          const { id, ...updateData } = record;
          const result = await entityApi.update(id, updateData);
          results.push({ success: true, id: result.id });
          console.log(`[data-manager] Bulk updated ${entity}: ${id}`);
        } catch (err) {
          results.push({ success: false, error: err.message, id: record.id });
          console.error(`[data-manager] Bulk update error for ${entity}:`, err.message);
        }
      }
      return Response.json({
        success: true,
        updated: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      });
    }

    // BULK DELETE BY IDS
    if (operation === 'bulk_delete') {
      if (ids && Array.isArray(ids) && ids.length > 0) {
        const results = [];
        for (const id of ids) {
          try {
            await entityApi.delete(id);
            results.push({ success: true, deleted: id });
            console.log(`[data-manager] Bulk deleted ${entity}: ${id}`);
          } catch (err) {
            results.push({ success: false, error: err.message, id });
            console.error(`[data-manager] Bulk delete error for ${entity}:`, err.message);
          }
        }
        return Response.json({
          success: true,
          deleted: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results
        });
      }
      // If no ids but a query is provided, fetch matching records then delete by ID
      if (query && typeof query === 'object' && Object.keys(query).length > 0) {
        const matching = await entityApi.filter(query);
        const matchIds = matching.map(r => r.id);
        const results = [];
        for (const id of matchIds) {
          try {
            await entityApi.delete(id);
            results.push({ success: true, deleted: id });
            console.log(`[data-manager] Query-deleted ${entity}: ${id}`);
          } catch (err) {
            results.push({ success: false, error: err.message, id });
            console.error(`[data-manager] Query-delete error for ${entity}:`, err.message);
          }
        }
        return Response.json({
          success: true,
          deleted: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results
        });
      }
      return Response.json({ success: false, error: 'ids array or query is required for bulk_delete' }, { status: 400 });
    }

    // UPSERT (update if record_id provided, create if not)
    if (operation === 'upsert') {
      if (!data) {
        return Response.json({ success: false, error: 'data is required for upsert' }, { status: 400 });
      }
      try {
        if (record_id) {
          const result = await entityApi.update(record_id, data);
          console.log(`[data-manager] Upserted (updated) ${entity}: ${record_id}`);
          return Response.json({ success: true, result, operation: 'updated' });
        } else {
          const result = await entityApi.create(data);
          console.log(`[data-manager] Upserted (created) ${entity}: ${result.id}`);
          return Response.json({ success: true, result, operation: 'created' });
        }
      } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500 });
      }
    }

    return Response.json({
      success: false,
      error: `Unknown operation: ${operation}. Supported: create, update, delete, bulk_create, bulk_update, bulk_delete, upsert`
    }, { status: 400 });

  } catch (error) {
    console.error('[data-manager] Error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});