
import { authenticateClient } from '../lib/auth-helpers';
import { resolveProvider } from '../lib/provider-factory';
import { log } from '../lib/logger';

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
    // Returns { available_dates: string[], slots_by_date: Record<string, TimeSlot[]> }
    const numDays = days ? Math.min(parseInt(days, 10) || 1, 60) : 0;

    if (numDays > 1) {
      const availableDates: string[] = [];
      const slotsByDate: Record<string, any[]> = {};

      // Fetch each day in parallel (batched to avoid rate limits)
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

      // Batch in groups of 7 to avoid overwhelming the provider
      for (let i = 0; i < datesToFetch.length; i += 7) {
        const batch = datesToFetch.slice(i, i + 7);
        const results = await Promise.all(
          batch.map(async (d) => {
            try {
              const slots = await provider.getAvailability({
                salon_id: client.salonId,
                service_variation_id,
                team_member_id,
                date: d,
              });
              return { date: d, slots };
            } catch {
              return { date: d, slots: [] };
            }
          })
        );
        for (const r of results) {
          if (r.slots.length > 0) {
            availableDates.push(r.date);
            slotsByDate[r.date] = r.slots;
          }
        }
      }

      return res.status(200).json({
        date,
        days: numDays,
        available_dates: availableDates,
        slots_by_date: slotsByDate,
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
