/**
 * Temporary diagnostic endpoint to debug provider credential resolution.
 * DELETE this file once the issue is resolved.
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing auth' });
    }

    const token = authHeader.slice(7);

    const supabaseAnon = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!
    );

    const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = userData.user.id;

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Find the user's salon membership
    const { data: membership } = await supabase
      .from('salon_memberships')
      .select('salon_id, role, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!membership) {
      return res.json({ error: 'No active membership', userId });
    }

    const salonId = membership.salon_id;

    // 2. Get salon's owner_user_id
    const { data: salon } = await supabase
      .from('salons')
      .select('id, owner_user_id, name')
      .eq('id', salonId)
      .maybeSingle();

    // 3. Check salon_provider_config
    const { data: providerConfig } = await supabase
      .from('salon_provider_config')
      .select('*')
      .eq('salon_id', salonId)
      .maybeSingle();

    // 4. Check merchant_settings by owner_user_id
    let merchantByOwner = null;
    if (salon?.owner_user_id) {
      const { data: m } = await supabase
        .from('merchant_settings')
        .select('supabase_user_id, square_merchant_id, square_access_token, square_connected_at')
        .eq('supabase_user_id', salon.owner_user_id)
        .maybeSingle();
      merchantByOwner = m ? {
        supabase_user_id: m.supabase_user_id,
        square_merchant_id: m.square_merchant_id,
        has_access_token: !!m.square_access_token,
        token_prefix: m.square_access_token ? m.square_access_token.substring(0, 10) + '...' : null,
        connected_at: m.square_connected_at,
      } : null;
    }

    // 5. Check salon_memberships for owner/admin
    const { data: adminMembers } = await supabase
      .from('salon_memberships')
      .select('user_id, role, status')
      .eq('salon_id', salonId)
      .in('role', ['owner', 'admin'])
      .eq('status', 'active');

    // 6. Check merchant_settings for each admin member
    const adminMerchants: any[] = [];
    if (adminMembers) {
      for (const am of adminMembers) {
        const { data: m } = await supabase
          .from('merchant_settings')
          .select('supabase_user_id, square_merchant_id, square_access_token, square_connected_at')
          .eq('supabase_user_id', am.user_id)
          .maybeSingle();
        adminMerchants.push({
          user_id: am.user_id,
          role: am.role,
          has_merchant_settings: !!m,
          has_access_token: !!m?.square_access_token,
          token_prefix: m?.square_access_token ? m.square_access_token.substring(0, 10) + '...' : null,
        });
      }
    }

    // 7. Also list ALL merchant_settings to see what exists
    const { data: allMerchants } = await supabase
      .from('merchant_settings')
      .select('supabase_user_id, square_merchant_id, square_connected_at')
      .limit(10);

    return res.json({
      client_user_id: userId,
      client_role: membership.role,
      salon: {
        id: salon?.id,
        name: salon?.name,
        owner_user_id: salon?.owner_user_id,
      },
      salon_provider_config: providerConfig ? { exists: true, provider_type: providerConfig.provider_type } : null,
      merchant_settings_by_owner: merchantByOwner,
      admin_members: adminMembers,
      admin_merchant_settings: adminMerchants,
      all_merchant_settings: allMerchants?.map(m => ({
        supabase_user_id: m.supabase_user_id,
        square_merchant_id: m.square_merchant_id,
        connected_at: m.square_connected_at,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
