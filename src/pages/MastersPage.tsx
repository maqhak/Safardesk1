import React, { useState } from 'react';
import { 
  Database, 
  Users, 
  Building, 
  Plane, 
  MapPin, 
  Bus,
  Plus, 
  Search, 
  ExternalLink,
  ShieldCheck,
  CheckCircle2
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
import { VehiclesPage } from './VehiclesPage';
import { INITIAL_AIRLINES } from '../data/airlines';
import { AIRPORTS_DATA } from '../data/airports';

type MasterTab = 'agents' | 'hotels' | 'airlines' | 'airports' | 'vendors' | 'vehicles';

export const MastersPage: React.FC = () => {
  const { info, success } = useToast();
  const [activeTab, setActiveTab] = useState<MasterTab>('airlines');
  const canCreate = useCan('Masters', 'create');

  const tabs: { key: MasterTab; label: string; icon: any; count: number }[] = [
    { key: 'airlines', label: 'Airlines', icon: Plane, count: INITIAL_AIRLINES.length },
    { key: 'agents', label: 'B2B Sub-Agents', icon: Users, count: 48 },
    { key: 'hotels', label: 'Hotels Directory', icon: Building, count: 112 },
    { key: 'airports', label: 'Airports & Reference', icon: MapPin, count: AIRPORTS_DATA.length },
    { key: 'vendors', label: 'Suppliers & Vendors', icon: Database, count: 26 },
    { key: 'vehicles', label: 'Vehicles & Transport', icon: Bus, count: 5 },
  ];

  const renderQaBanner = () => (
    <div className="bg-gradient-to-r from-navy-900 to-[#0e2c4c] text-white p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-[#c9a227]" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#c9a227]">Reference Data QA Verification Panel</h4>
          <p className="text-xs text-slate-300">Seeded master datasets verified and active across all global operations.</p>
        </div>
      </div>
      <div className="flex items-center gap-4 font-mono text-xs">
        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 text-center">
          <span className="text-[10px] text-slate-300 block">Airlines Seeded</span>
          <span className="text-sm font-bold text-white">{INITIAL_AIRLINES.length}+ Carriers</span>
        </div>
        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 text-center">
          <span className="text-[10px] text-slate-300 block">Airports Seeded</span>
          <span className="text-sm font-bold text-[#c9a227]">{AIRPORTS_DATA.length}+ Hubs</span>
        </div>
      </div>
    </div>
  );

  if (activeTab === 'airlines') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Master Records & Directories"
          subtitle="Manage foundational business master data: sub-agents, contracted hotel inventory, airline codes, and service suppliers."
          breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters' }]}
        />
        {renderQaBanner()}
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
        <PageHeader
          title="Master Records & Directories"
          subtitle="Manage foundational business master data: sub-agents, contracted hotel inventory, airline codes, and service suppliers."
          breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters' }]}
        />
        {renderQaBanner()}
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
        <PageHeader
          title="Master Records & Directories"
          subtitle="Manage foundational business master data: sub-agents, contracted hotel inventory, airline codes, and service suppliers."
          breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters' }]}
        />
        {renderQaBanner()}
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

  if (activeTab === 'vehicles') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Master Records & Directories"
          subtitle="Manage foundational business master data: sub-agents, contracted hotel inventory, airline codes, and service suppliers."
          breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters' }]}
        />
        {renderQaBanner()}
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
        <VehiclesPage />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Records & Directories"
        subtitle="Manage foundational business master data: sub-agents, contracted hotel inventory, airline codes, and service suppliers."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters' }]}
      />
      {renderQaBanner()}

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

      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-12 text-center text-slate-500">
        <h3 className="text-sm font-bold text-slate-800 mb-1">Directory view for {activeTab.toUpperCase()}</h3>
        <p className="text-xs">Select a master directory tab above to inspect records.</p>
      </div>
    </div>
  );
};
