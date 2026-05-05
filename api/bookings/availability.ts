
import { authenticateClient } from '../_lib/auth-helpers.js';
import { resolveProvider } from '../_lib/provider-factory.js';
import { log } from '../_lib/logger.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // 1. Authenticate client and verify booking eligibility
    const client = await authenticateClient(
      req.headers['authorization'] as string | undefined,
      req.query.salon_id as string | undefined
    );

    const { service_variation_id, team_member_id, date, days } = req.query as {
      service_variation_id?: string;
      team_member_id?: string;
      date?: string;
      days?: string;
    };

    if (!service_variation_id || !date) {
      return res.status(400).json({
        code: 'MISSING_FIELDS',
        message: 'Missing required parameters: service_variation_id, date',
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ code: 'INVALID_DATE', message: 'Date must be in YYYY-MM-DD format' });
    }

    // 2. Resolve provider adapter for this salon
    const provider = await resolveProvider(client.salonId);

    // If days param is provided, fetch availability across a date range
    // Uses the same single-date Square API call that the Pro uses, batched
    const numDays = days ? Math.min(parseInt(days, 10) || 1, 45) : 0;

    if (numDays > 1) {
      const startDate = new Date(date + 'T12:00:00Z');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const datesToFetch: string[] = [];
      for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        if (d >= today) {
          datesToFetch.push(d.toISOString().split('T')[0]);
        }
      }

      // Batch in groups of 5 to stay within Vercel timeout
      const allSlots: any[] = [];
      for (let i = 0; i < datesToFetch.length; i += 5) {
        const batch = datesToFetch.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(async (d) => {
            try {
              return await provider.getAvailability({
                salon_id: client.salonId,
                service_variation_id,
                team_member_id,
                date: d,
              });
            } catch {
              return [];
            }
          })
        );
        for (const r of results) {
          if (Array.isArray(r)) allSlots.push(...r);
        }
      }

      return res.status(200).json({
        date,
        days: numDays,
        slots: allSlots,
      });
    }

    // 3. Fetch availability from provider (single date)
    const slots = await provider.getAvailability({
      salon_id: client.salonId,
      service_variation_id,
      team_member_id,
      date,
    });

    // 4. Return provider-agnostic time slots
    // Client never sees provider-specific identifiers
    return res.status(200).json({
      date,
      slots,
    });
  } catch (err: any) {
    const status = err.status || 500;
    const code = err.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
    log('AVAILABILITY_FAILED', { status, code, message: err.message });
    return res.status(status).json({
      code,
      message: err.message || 'Failed to fetch availability',
    });
  }
}
