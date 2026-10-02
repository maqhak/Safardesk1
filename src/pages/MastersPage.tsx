import React, { useState } from 'react';
import { 
  Database, 
  Users, 
  Building, 
  Plane, 
  MapPin, 
  Plus, 
  Search, 
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { AgentsPage } from './AgentsPage';
import { AirlinesPage } from './AirlinesPage';
import { VendorsPage } from './VendorsPage';

type MasterTab = 'agents' | 'hotels' | 'airlines' | 'airports' | 'vendors';

export const MastersPage: React.FC = () => {
  const { info, success } = useToast();
  const [activeTab, setActiveTab] = useState<MasterTab>('airlines');
  const [search, setSearch] = useState('');
  const canCreate = useCan('Masters', 'create');

  const tabs: { key: MasterTab; label: string; icon: any; count: number }[] = [
    { key: 'airlines', label: 'Airlines', icon: Plane, count: 72 },
    { key: 'agents', label: 'B2B Sub-Agents', icon: Users, count: 48 },
    { key: 'hotels', label: 'Hotels Directory', icon: Building, count: 112 },
    { key: 'airports', label: 'Airports & Reference', icon: MapPin, count: 100 },
    { key: 'vendors', label: 'Suppliers & Vendors', icon: Database, count: 26 },
  ];

  if (activeTab === 'airlines') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-[#0e2c4c] text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <AirlinesPage />
      </div>
    );
  }

  if (activeTab === 'agents') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-[#0e2c4c] text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <AgentsPage />
      </div>
    );
  }

  if (activeTab === 'vendors') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-[#0e2c4c] text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <VendorsPage />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Records & Directories"
        subtitle="Manage foundational business master data: sub-agents, contracted hotel inventory, airline codes, and service suppliers."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters' }]}
        actions={
          canCreate ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => info(`Add record dialog for ${activeTab.toUpperCase()} ready in Phase 1.`)}
            >
              Add New Record
            </Button>
          ) : null
        }
      />

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-[#0e2c4c] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Registry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeTab === 'hotels' && (
          <>
            <Card hoverEffect padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Makkah Clock Royal Tower</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Abraj Al Bait, Makkah • 5-Star</p>
                </div>
                <Badge variant="navy">Contracted</Badge>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                Direct allotment contract: 25 rooms / day during Umrah season.
              </div>
            </Card>

            <Card hoverEffect padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">The Oberoi Madina</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Central Northern Area, Madinah • 5-Star</p>
                </div>
                <Badge variant="navy">Contracted</Badge>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                Direct Haram facing luxury allotment.
              </div>
            </Card>

            <Card hoverEffect padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Swissôtel Al Maqam Makkah</h4>
                  <p className="text-xs text-slate-500 mt-0.5">King Abdul Aziz Endowment, Makkah</p>
                </div>
                <Badge variant="navy">Contracted</Badge>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                Standard & Quad room contract allocations.
              </div>
            </Card>
          </>
        )}

        {activeTab !== 'hotels' && (
          <div className="col-span-full p-8 text-center bg-white rounded-xl border border-slate-200">
            <p className="text-sm font-semibold text-slate-800">
              Master Registry for {activeTab.toUpperCase()}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Firestore collection schema defined in <code className="font-mono">FIRESTORE_COLLECTIONS.md</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
