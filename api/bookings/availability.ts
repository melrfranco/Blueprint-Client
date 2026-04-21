
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

    const { service_variation_id, team_member_id, date } = req.query as {
      service_variation_id?: string;
      team_member_id?: string;
      date?: string;
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

    // 3. Fetch availability from provider
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
