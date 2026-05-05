import React, { useState, useMemo } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { apiClient } from '../services/apiClient';
import { StarIcon, CheckCircleIcon, GiftIcon } from './icons';

export const MembershipView: React.FC = () => {
  const { plans, membershipTiers, refresh } = useClientData();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePlan = useMemo(
    () => plans.find((p) => p.status === 'active') || plans[0],
    [plans],
  );

  const membershipStatus = activePlan?.membershipStatus || 'none';
  const isOffered = membershipStatus === 'offered';
  const isActive = membershipStatus === 'active';

  const handleAccept = async () => {
    if (!activePlan) return;
    setAccepting(true);
    setError(null);
    try {
      await apiClient.acceptMembership(activePlan.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept membership');
    } finally {
      setAccepting(false);
    }
  };

  // Resolve the qualifying tier: prefer the one saved in the plan data,
  // fall back to computing it from the salon's membershipTiers (same logic as Pro app)
  const qualifyingTier = useMemo(() => {
    if (activePlan?.membershipTier) return activePlan.membershipTier;
    if (!activePlan || membershipTiers.length === 0) return null;
    const projectedMonthlySpend = (activePlan.totalCost || 0) / 12;
    const sortedTiers = [...membershipTiers].sort((a, b) => b.minSpend - a.minSpend);
    return sortedTiers.find(t => projectedMonthlySpend >= t.minSpend) || sortedTiers[sortedTiers.length - 1] || null;
  }, [activePlan, membershipTiers]);

  // Calculate potential savings based on the tier's minSpend vs plan totalCost
  // The savings = what they'd pay a la carte (totalCost) minus what membership costs (minSpend * 12)
  // If membership is cheaper than a la carte, that's the savings.
  const savings = useMemo(() => {
    if (!activePlan || !qualifyingTier) return null;
    const totalCost = activePlan.totalCost || 0;
    const monthlyMembershipRate = qualifyingTier.minSpend;
    const annualMembershipCost = monthlyMembershipRate * 12;
    // Savings = a la carte total - membership total (only if membership is cheaper)
    const annualSavings = Math.max(0, totalCost - annualMembershipCost);
    const monthlySavings = annualSavings / 12;
    return { monthlySavings, annualSavings, annualMembershipCost };
  }, [activePlan, qualifyingTier]);

  if (!activePlan) {
    return (
      <div className="bp-page">
        <h1 className="bp-page-title">Membership</h1>
        <p className="bp-subtitle mb-6">Benefits & savings</p>
        <div className="bp-card bp-card-padding-md">
          <p className="bp-body-sm text-muted-foreground text-center py-8">
            No plan yet. Your salon will send you one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">Membership</h1>
      <p className="bp-subtitle mb-6">Benefits & savings</p>

      <div className="space-y-6">
        {/* Status card */}
        {isActive ? (
          <div className="bp-card bp-card-padding-md">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <CheckCircleIcon className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="bp-section-title">
                  {qualifyingTier ? `${qualifyingTier.name} Member` : 'Active Member'}
                </h3>
                {qualifyingTier?.perks && qualifyingTier.perks.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {qualifyingTier.perks.map((perk, i) => (
                      <p key={i} className="bp-caption text-muted-foreground">• {perk}</p>
                    ))}
                  </div>
                ) : (
                  <p className="bp-body-sm text-muted-foreground">
                    Enjoy your membership perks and discounts on every visit.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : isOffered ? (
          <div className="bp-card bp-card-padding-md">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-secondary/10 rounded-full">
                <StarIcon className="w-8 h-8 text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="bp-section-title mb-1">
                  {qualifyingTier
                    ? `${qualifyingTier.name} Membership`
                    : "You're Invited!"}
                </h3>
                <p className="bp-body-sm text-muted-foreground mb-4">
                  Your salon has offered you a membership. Join to unlock exclusive benefits.
                </p>

                {/* Real perks from the tier */}
                {qualifyingTier?.perks && qualifyingTier.perks.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {qualifyingTier.perks.map((perk, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        <span className="bp-body-sm">{perk}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="bp-body-sm text-muted-foreground mb-4">
                    Ask your salon about the benefits included with your membership.
                  </p>
                )}

                {/* Savings estimate — only show if there are real savings */}
                {savings && savings.annualSavings > 0 && (
                  <div className="flex items-center gap-4 p-3 bg-primary/5 rounded-2xl mb-4">
                    <GiftIcon className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <p className="bp-overline">Estimated Savings</p>
                      <p className="bp-stat-value text-lg">
                        ~${savings.annualSavings.toFixed(0)}/yr
                      </p>
                      <p className="bp-caption text-muted-foreground">
                        (~${savings.monthlySavings.toFixed(0)}/mo)
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="bp-caption text-destructive mb-3">{error}</p>
                )}

                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="bp-button bp-button-primary w-full disabled:opacity-60"
                >
                  {accepting ? 'Accepting...' : 'Accept Membership'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bp-card bp-card-padding-md">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted rounded-full">
                <StarIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="bp-section-title mb-1">Not a Member Yet</h3>
                <p className="bp-body-sm text-muted-foreground">
                  Ask your salon about membership benefits and exclusive savings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plan summary */}
        <div className="bp-card bp-card-padding-md">
          <h3 className="bp-card-title mb-3">Your Plan Overview</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="bp-overline">Avg Per Visit</p>
              <p className="bp-stat-value text-lg">
                ${((activePlan.totalCost || 0) / Math.max(activePlan.appointments?.length || 1, 1)).toFixed(0)}
              </p>
            </div>
            <div>
              <p className="bp-overline">Avg Monthly</p>
              <p className="bp-stat-value text-lg">
                ${((activePlan.totalCost || 0) / 12).toFixed(0)}
              </p>
            </div>
            <div>
              <p className="bp-overline">Visits/Year</p>
              <p className="bp-stat-value text-lg">
                {activePlan.appointments?.length || 0}
              </p>
            </div>
            <div>
              <p className="bp-overline">Annual Total</p>
              <p className="bp-stat-value text-lg">
                ${(activePlan.totalCost || 0).toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
