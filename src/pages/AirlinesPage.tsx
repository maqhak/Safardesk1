import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  Plus, 
  Search, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  Database,
  Plane,
  Edit,
  Power
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { DataTable, Column } from '../components/ui/DataTable';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { AirlineDoc, AirportRef } from '../types/master';
import { fetchAirlines, createAirline, updateAirline, toggleAirlineStatus, fetchAirports } from '../services/masterService';
import { AirlineSelect, AirportSelect } from '../components/ui';

export const AirlinesPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const canView = useCan('Masters', 'view');
  const canCreate = useCan('Masters', 'create');
  const canEdit = useCan('Masters', 'edit');

  const [airlines, setAirlines] = useState<AirlineDoc[]>([]);
  const [airportsCount, setAirportsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Add Airline Modal
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [iataCode, setIataCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [country, setCountry] = useState<string>('Saudi Arabia');

  // Edit Airline Modal
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [targetAirline, setTargetAirline] = useState<AirlineDoc | null>(null);
  const [editIata, setEditIata] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editCountry, setEditCountry] = useState<string>('');
  const [editing, setEditing] = useState<boolean>(false);

  // Demo Select Playground Modal
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);
  const [selectedAirport, setSelectedAirport] = useState<AirportRef | null>(null);
  const [selectedAirline, setSelectedAirline] = useState<AirlineDoc | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [airlineList, airportList] = await Promise.all([
        fetchAirlines(),
        fetchAirports(),
      ]);
      setAirlines(airlineList);
      setAirportsCount(airportList.length);
    } catch {
      showError('Failed to load airlines master directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddAirline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const cleanIata = iataCode.trim().toUpperCase();
    if (cleanIata.length !== 2) {
      showError('IATA code must be exactly 2 characters (e.g. SV, EK).');
      return;
    }
    if (!name.trim() || !country.trim()) {
      showError('Please complete all required fields.');
      return;
    }

    setCreating(true);
    try {
      await createAirline(userProfile, {
        iataCode: cleanIata,
        name: name.trim(),
        country: country.trim(),
      });

      success(`Airline "${name}" (${cleanIata}) added successfully.`);
      setAddModalOpen(false);
      setIataCode('');
      setName('');
      setCountry('Saudi Arabia');
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to create airline.');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (a: AirlineDoc) => {
    setTargetAirline(a);
    setEditIata(a.iataCode);
    setEditName(a.name);
    setEditCountry(a.country);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !targetAirline) return;

    const cleanIata = editIata.trim().toUpperCase();
    if (cleanIata.length !== 2) {
      showError('IATA code must be exactly 2 characters.');
      return;
    }

    setEditing(true);
    try {
      await updateAirline(userProfile, targetAirline.id, {
        iataCode: cleanIata,
        name: editName.trim(),
        country: editCountry.trim(),
      });

      success(`Airline ${cleanIata} updated successfully.`);
      setEditModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to update airline.');
    } finally {
      setEditing(false);
    }
  };

  const handleToggleStatus = async (a: AirlineDoc) => {
    if (!userProfile) return;
    try {
      await toggleAirlineStatus(userProfile, a.id);
      success(`Airline ${a.iataCode} status toggled.`);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to toggle status.');
    }
  };

  const filteredAirlines = airlines.filter((a) =>
    a.iataCode.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.country.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<AirlineDoc>[] = [
    {
      key: 'iataCode',
      header: 'IATA Code',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-bold text-[var(--theme-primary)] bg-slate-100 px-2 py-1 rounded text-xs">
          {row.iataCode}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Airline Name',
      sortable: true,
      render: (row) => <span className="font-semibold text-slate-800">{row.name}</span>,
    },
    {
      key: 'country',
      header: 'Country',
      sortable: true,
      render: (row) => <span className="text-slate-600">{row.country}</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(row)}
                leftIcon={<Edit className="w-3.5 h-3.5" />}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleStatus(row)}
                className={row.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}
                leftIcon={<Power className="w-3.5 h-3.5" />}
              >
                {row.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Airlines Master & Airport Reference"
        subtitle="Manage operating airlines with 2-char unique IATA codes and explore worldwide airport reference dataset."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters', href: '/masters' }, { label: 'Airlines' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plane className="w-4 h-4 text-[#c9a227]" />}
              onClick={() => setDemoModalOpen(true)}
            >
              Test Airport / Airline Selects
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setAddModalOpen(true)}
              >
                Add Airline
              </Button>
            )}
          </div>
        }
      />

      {/* Dataset QA Counts Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center justify-between border-slate-200">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Operating Airlines</div>
            <div className="text-2xl font-bold text-[var(--theme-primary)] mt-1">{airlines.length}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Seeded with IATA validation</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#0e2c4c]/10 flex items-center justify-center text-[var(--theme-primary)]">
            <Compass className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-slate-200">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Worldwide Airports Dataset</div>
            <div className="text-2xl font-bold text-[var(--theme-primary)] mt-1">{airportsCount}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Lazy search enabled with 50 cap</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#c9a227]/10 flex items-center justify-center text-[#c9a227]">
            <Plane className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-slate-200">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duplicate Protection</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">Enforced</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Unique 2-char IATA codes</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </Card>
      </div>

      {/* Airlines Table */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search airlines by IATA, name, country..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20 focus:border-[#0e2c4c]"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredAirlines.length} of {airlines.length} airlines
          </div>
        </div>

        <DataTable
          data={filteredAirlines}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={loading}
          emptyTitle="No airlines found"
          emptyDescription="No airlines match your search criteria."
        />
      </Card>

      {/* Add Airline Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Operating Airline"
        subtitle="Enter airline details with unique 2-character IATA code."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddAirline} loading={creating}>Save Airline</Button>
          </div>
        }
      >
        <form onSubmit={handleAddAirline} className="space-y-4">
          <div>
            <Input
              label="IATA Code (2 Characters)"
              placeholder="e.g. SV, EK, QR"
              maxLength={2}
              value={iataCode}
              onChange={(e) => setIataCode(e.target.value.toUpperCase())}
              required
              helperText="Must be strictly 2 uppercase characters. Duplicates are rejected."
            />
          </div>
          <div>
            <Input
              label="Airline Name"
              placeholder="e.g. Saudia or Emirates"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              label="Country / Base"
              placeholder="e.g. Saudi Arabia"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      {/* Edit Airline Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Airline"
        subtitle={`Updating airline ${targetAirline?.iataCode || ''}`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveEdit} loading={editing}>Update Airline</Button>
          </div>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <Input
              label="IATA Code"
              maxLength={2}
              value={editIata}
              onChange={(e) => setEditIata(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div>
            <Input
              label="Airline Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              label="Country"
              value={editCountry}
              onChange={(e) => setEditCountry(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      {/* Component QA Demo Playground Modal */}
      <Modal
        isOpen={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        title="Airport & Airline Select Components QA"
        subtitle="Test the high-performance lazy search components with keyboard navigation and recent selections."
        footer={
          <Button variant="primary" onClick={() => setDemoModalOpen(false)}>Close Playground</Button>
        }
      >
        <div className="space-y-6 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>QA Note:</strong> Type in either select to trigger lazy search. Results are capped at 50 with "type to refine". Selections are stored as structured objects <code>{"{ iata, city, name }"}</code>.
          </div>

          <div className="space-y-4">
            <AirportSelect
              label="Select Origin / Destination Airport"
              value={selectedAirport}
              onChange={setSelectedAirport}
              placeholder="Search airport (e.g. JED, ISB, LHR)..."
            />
            {selectedAirport && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 text-slate-700">
                <div><strong>Selected Airport Object:</strong></div>
                <div>IATA: <code>{selectedAirport.iata}</code></div>
                <div>City: <code>{selectedAirport.city}</code></div>
                <div>Name: <code>{selectedAirport.name}</code></div>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <AirlineSelect
              label="Select Operating Airline"
              value={selectedAirline}
              onChange={setSelectedAirline}
              placeholder="Search airline (e.g. SV, PIA, Emirates)..."
            />
            {selectedAirline && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 text-slate-700">
                <div><strong>Selected Airline Object:</strong></div>
                <div>IATA: <code>{selectedAirline.iataCode}</code></div>
                <div>Name: <code>{selectedAirline.name}</code></div>
                <div>Country: <code>{selectedAirline.country}</code></div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
