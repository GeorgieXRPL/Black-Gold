'use client';

/**
 * @fileoverview Syndicate Management Panel
 * Displays syndicate info, members, and management controls
 */

import { useState } from 'react';

export interface SyndicateMember {
  walletAddress: string;
  role: 'leader' | 'officer' | 'member';
  joinedAt: Date;
  totalContributed: number;
}

export interface SyndicateInfo {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  members: SyndicateMember[];
  treasury: number;
  settings: {
    rewardSplit: number;
    raidCoordination: boolean;
    defenseAlerts: boolean;
  };
  warWins: number;
  warLosses: number;
}

interface SyndicatePanelProps {
  syndicate: SyndicateInfo | null;
  userWallet: string;
  onCreateSyndicate?: (name: string, tag: string) => void;
  onLeaveSyndicate?: () => void;
  onInviteMember?: (wallet: string) => void;
  onKickMember?: (wallet: string) => void;
  onPromoteMember?: (wallet: string) => void;
  onDemoteMember?: (wallet: string) => void;
  onUpdateSettings?: (settings: Partial<SyndicateInfo['settings']>) => void;
  onDepositTreasury?: (amount: number) => void;
}

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'leader': return 'text-gold-400';
    case 'officer': return 'text-purple-400';
    default: return 'text-coal-300';
  }
}

function getRoleBadge(role: string): string {
  switch (role) {
    case 'leader': return '👑';
    case 'officer': return '⚔️';
    default: return '';
  }
}

export default function SyndicatePanel({
  syndicate,
  userWallet,
  onCreateSyndicate,
  onLeaveSyndicate,
  onInviteMember,
  onKickMember,
  onPromoteMember,
  onDemoteMember,
  onUpdateSettings,
  onDepositTreasury,
}: SyndicatePanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState('');
  const [inviteWallet, setInviteWallet] = useState('');
  const [depositAmount, setDepositAmount] = useState(0);
  const [activeTab, setActiveTab] = useState<'members' | 'settings' | 'treasury'>('members');

  const isLeader = syndicate?.leaderId === userWallet;
  const userMember = syndicate?.members.find(m => m.walletAddress === userWallet);
  const isOfficer = userMember?.role === 'officer' || isLeader;

  const handleCreate = () => {
    if (newName && newTag && onCreateSyndicate) {
      onCreateSyndicate(newName, newTag);
      setShowCreateForm(false);
      setNewName('');
      setNewTag('');
    }
  };

  const handleInvite = () => {
    if (inviteWallet && onInviteMember) {
      onInviteMember(inviteWallet);
      setInviteWallet('');
    }
  };

  const handleDeposit = () => {
    if (depositAmount > 0 && onDepositTreasury) {
      onDepositTreasury(depositAmount);
      setDepositAmount(0);
    }
  };

  // No syndicate - show create/join options
  if (!syndicate) {
    return (
      <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-coal-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🏴</span> Syndicates
          </h3>
        </div>

        <div className="p-6">
          {!showCreateForm ? (
            <div className="text-center">
              <div className="text-6xl mb-4">🏴‍☠️</div>
              <h4 className="text-xl font-bold text-white mb-2">Join a Syndicate</h4>
              <p className="text-coal-400 mb-6">
                Band together with other miners for coordinated raids and shared rewards!
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-bold transition-colors"
              >
                Create Syndicate (1000 COAL)
              </button>
              <p className="text-xs text-coal-500 mt-2">
                Creation cost is burned 🔥
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-white">Create Syndicate</h4>
              
              <div>
                <label className="block text-sm text-coal-400 mb-1">Syndicate Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Coal Cartel"
                  maxLength={24}
                  className="w-full px-4 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white placeholder-coal-500 focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-coal-400 mb-1">Tag (2-4 chars)</label>
                <div className="flex items-center gap-2">
                  <span className="text-coal-500">[</span>
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value.toUpperCase())}
                    placeholder="COAL"
                    maxLength={4}
                    className="w-24 px-3 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white text-center uppercase placeholder-coal-500 focus:border-purple-500 outline-none"
                  />
                  <span className="text-coal-500">]</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2 bg-coal-700 hover:bg-coal-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName || newTag.length < 2}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-coal-700 disabled:text-coal-500 text-white rounded-lg font-semibold transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Has syndicate - show management UI
  return (
    <div className="bg-coal-900/90 backdrop-blur-sm border border-coal-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-coal-700 bg-gradient-to-r from-purple-900/50 to-pink-900/50">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-bold rounded">
                [{syndicate.tag}]
              </span>
              <h3 className="text-lg font-bold text-white">{syndicate.name}</h3>
            </div>
            <div className="text-sm text-coal-400 mt-1">
              {syndicate.members.length} members • {syndicate.warWins}W/{syndicate.warLosses}L
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-coal-400">Treasury</div>
            <div className="text-lg font-bold text-gold-400">{syndicate.treasury.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-coal-700">
        {(['members', 'settings', 'treasury'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-coal-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {activeTab === 'members' && (
          <div className="space-y-3">
            {/* Invite (officers only) */}
            {isOfficer && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={inviteWallet}
                  onChange={(e) => setInviteWallet(e.target.value)}
                  placeholder="Wallet address to invite"
                  className="flex-1 px-3 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white text-sm placeholder-coal-500 focus:border-purple-500 outline-none"
                />
                <button
                  onClick={handleInvite}
                  disabled={!inviteWallet}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-coal-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Invite
                </button>
              </div>
            )}

            {/* Member list */}
            {syndicate.members
              .sort((a, b) => {
                const roleOrder = { leader: 0, officer: 1, member: 2 };
                return roleOrder[a.role] - roleOrder[b.role];
              })
              .map((member) => (
                <div
                  key={member.walletAddress}
                  className="flex items-center justify-between p-2 bg-coal-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span>{getRoleBadge(member.role)}</span>
                    <span className={`font-mono text-sm ${getRoleColor(member.role)}`}>
                      {truncateWallet(member.walletAddress)}
                    </span>
                    {member.walletAddress === userWallet && (
                      <span className="text-xs text-coal-500">(you)</span>
                    )}
                  </div>
                  
                  {/* Actions */}
                  {isLeader && member.walletAddress !== userWallet && (
                    <div className="flex items-center gap-1">
                      {member.role === 'member' && (
                        <button
                          onClick={() => onPromoteMember?.(member.walletAddress)}
                          className="px-2 py-1 text-xs bg-purple-600/50 hover:bg-purple-600 text-purple-200 rounded transition-colors"
                          title="Promote to Officer"
                        >
                          ↑
                        </button>
                      )}
                      {member.role === 'officer' && (
                        <button
                          onClick={() => onDemoteMember?.(member.walletAddress)}
                          className="px-2 py-1 text-xs bg-coal-600/50 hover:bg-coal-600 text-coal-200 rounded transition-colors"
                          title="Demote to Member"
                        >
                          ↓
                        </button>
                      )}
                      <button
                        onClick={() => onKickMember?.(member.walletAddress)}
                        className="px-2 py-1 text-xs bg-red-600/50 hover:bg-red-600 text-red-200 rounded transition-colors"
                        title="Kick"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-coal-300">Treasury Split</span>
                <span className="text-white font-semibold">{syndicate.settings.rewardSplit}%</span>
              </div>
              {isLeader && (
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={syndicate.settings.rewardSplit}
                  onChange={(e) => onUpdateSettings?.({ rewardSplit: Number(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              )}
              <p className="text-xs text-coal-500 mt-1">
                Percentage of member earnings that go to treasury
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-coal-300">Raid Coordination</span>
                <p className="text-xs text-coal-500">Enable syndicate raids</p>
              </div>
              {isLeader ? (
                <button
                  onClick={() => onUpdateSettings?.({ 
                    raidCoordination: !syndicate.settings.raidCoordination 
                  })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    syndicate.settings.raidCoordination ? 'bg-purple-600' : 'bg-coal-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    syndicate.settings.raidCoordination ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              ) : (
                <span className={syndicate.settings.raidCoordination ? 'text-green-400' : 'text-red-400'}>
                  {syndicate.settings.raidCoordination ? 'ON' : 'OFF'}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-coal-300">Defense Alerts</span>
                <p className="text-xs text-coal-500">Notify when members under attack</p>
              </div>
              {isLeader ? (
                <button
                  onClick={() => onUpdateSettings?.({ 
                    defenseAlerts: !syndicate.settings.defenseAlerts 
                  })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    syndicate.settings.defenseAlerts ? 'bg-purple-600' : 'bg-coal-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    syndicate.settings.defenseAlerts ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              ) : (
                <span className={syndicate.settings.defenseAlerts ? 'text-green-400' : 'text-red-400'}>
                  {syndicate.settings.defenseAlerts ? 'ON' : 'OFF'}
                </span>
              )}
            </div>
          </div>
        )}

        {activeTab === 'treasury' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-gold-400">
                {syndicate.treasury.toLocaleString()} COAL
              </div>
              <div className="text-sm text-coal-400">Syndicate Treasury</div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={depositAmount || ''}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  placeholder="Amount"
                  min="1"
                  className="flex-1 px-3 py-2 bg-coal-800 border border-coal-600 rounded-lg text-white placeholder-coal-500 focus:border-gold-500 outline-none"
                />
                <button
                  onClick={handleDeposit}
                  disabled={depositAmount <= 0}
                  className="px-4 py-2 bg-gold-600 hover:bg-gold-500 disabled:bg-coal-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Deposit
                </button>
              </div>
              <p className="text-xs text-coal-500 text-center">
                Deposits support syndicate operations
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Leave button */}
      <div className="p-4 border-t border-coal-700">
        <button
          onClick={onLeaveSyndicate}
          className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50 rounded-lg text-sm transition-colors"
        >
          Leave Syndicate
        </button>
      </div>
    </div>
  );
}
