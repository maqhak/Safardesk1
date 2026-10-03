import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building, 
  Search, 
  Filter, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Upload, 
  FileSpreadsheet, 
  Phone, 
  Star, 
  Building2, 
  ShieldAlert,
  AlertTriangle,
  Check
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { HotelDoc, VendorDoc, RoomTypeRate } from '../types/master';
import { fetchHotels, createHotel, updateHotel, toggleHotelStatus, deleteOrDeactivateHotel, fetchVendors } from '../services/masterService';
import { MAKKAH_HOTELS_SEED, MADINAH_HOTELS_SEED } from '../data/hotels';

export const HotelsPage: React.FC<{ lockedCity?: 'Makkah' | 'Madinah' }> = ({ lockedCity }) => {
  const cityLabel = lockedCity === 'Madinah' ? 'Madina' : (lockedCity || '');
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();
  const isOwner = role === 'owner';
  const canCreate = useCan('Masters', 'create') || isOwner;
  const canEdit = useCan('Masters', 'edit') || isOwner;

  const [loading, setLoading] = useState<boolean>(true);
  const [hotels, setHotels] = useState<HotelDoc[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);

  // Filter states
  const [search, setSearch] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>(lockedCity || 'Makkah');

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingHotel, setEditingHotel] = useState<HotelDoc | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Form states
  const [name, setName] = useState<string>('');
  const [city, setCity] = useState<string>('Makkah');
  const [starRating, setStarRating] = useState<3 | 4 | 5>(5);
  const [vendorId, setVendorId] = useState<string>('');
  const [distanceFromHaram, setDistanceFromHaram] = useState<string>('');
  const [availabilityNote, setAvailabilityNote] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Room types & rates
  const [roomTypes, setRoomTypes] = useState<RoomTypeRate[]>([
    { bedType: 'Double', nightlyRateSAR: 950 },
    { bedType: 'Triple', nightlyRateSAR: 1200 },
    { bedType: 'Quad', nightlyRateSAR: 1450 },
    { bedType: 'Sharing', nightlyRateSAR: 350 },
  ]);

  // Seed inventory loading state
  const [seeding, setSeeding] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [hList, vList] = await Promise.all([
        fetchHotels(),
        fetchVendors(),
      ]);
      setHotels(hList);
      setVendors(vList.filter(v => v.isActive));
      if (vList.length > 0 && !vendorId) {
        setVendorId(vList[0].id);
      }
    } catch {
      showError('Failed to load hotels directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  const filteredHotels = useMemo(() => {
    return hotels.filter((h) => {
      if (cityFilter === 'Makkah' && h.city.toLowerCase() !== 'makkah') return false;
      if (cityFilter === 'Madinah' && h.city.toLowerCase() !== 'madinah') return false;
      if (cityFilter === 'Other' && ['makkah', 'madinah'].includes(h.city.toLowerCase())) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const vName = vendorMap.get(h.vendorId)?.name || '';
        return h.name.toLowerCase().includes(q) || h.city.toLowerCase().includes(q) || vName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [hotels, cityFilter, search, vendorMap]);

  const handleOpenAdd = () => {
    setEditingHotel(null);
    setName('');
    setCity('Makkah');
    setStarRating(5);
    setVendorId(vendors[0]?.id || '');
    setDistanceFromHaram('100 meters');
    setAvailabilityNote('Available');
    setContactPhone('+966 ');
    setNotes('');
    setIsActive(true);
    setRoomTypes([
      { bedType: 'Double', nightlyRateSAR: 950 },
      { bedType: 'Triple', nightlyRateSAR: 1200 },
      { bedType: 'Quad', nightlyRateSAR: 1450 },
      { bedType: 'Sharing', nightlyRateSAR: 350 },
    ]);
    setModalOpen(true);
  };

  const handleOpenEdit = (h: HotelDoc) => {
    setEditingHotel(h);
    setName(h.name);
    setCity(h.city);
    setStarRating(h.starRating);
    setVendorId(h.vendorId);
    setDistanceFromHaram(h.distanceFromHaram || '');
    setAvailabilityNote(h.availabilityNote || '');
    setContactPhone(h.contactPhone || '');
    setNotes(h.notes || '');
    setIsActive(h.isActive);
    setRoomTypes(h.roomTypes && h.roomTypes.length > 0 ? [...h.roomTypes] : [
      { bedType: 'Double', nightlyRateSAR: 950 },
      { bedType: 'Triple', nightlyRateSAR: 1200 },
      { bedType: 'Quad', nightlyRateSAR: 1450 },
      { bedType: 'Sharing', nightlyRateSAR: 350 },
    ]);
    setModalOpen(true);
  };

  const handleSaveHotel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!name.trim() || !vendorId) {
      showError('Hotel Name and Vendor (Shirka) are mandatory.');
      return;
    }

    setSaving(true);
    try {
      if (editingHotel) {
        await updateHotel(userProfile, editingHotel.id, {
          name: name.trim(),
          city,
          starRating,
          vendorId,
          distanceFromHaram,
          roomTypes,
          availabilityNote,
          contactPhone,
          notes,
          isActive,
        });
        success(`Hotel "${name}" updated successfully.`);
      } else {
        await createHotel(userProfile, {
          name: name.trim(),
          city,
          starRating,
          vendorId,
          distanceFromHaram,
          roomTypes,
          availabilityNote,
          contactPhone,
          notes,
          isActive,
        });
        success(`Hotel "${name}" created successfully.`);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to save hotel.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrDeactivate = async (h: HotelDoc) => {
    if (!userProfile) return;
    try {
      const msg = await deleteOrDeactivateHotel(userProfile, h.id);
      info(msg);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete/deactivate hotel.');
    }
  };

  const handleToggleStatus = async (h: HotelDoc) => {
    if (!userProfile) return;
    try {
      await toggleHotelStatus(userProfile, h.id);
      success(`Hotel status updated.`);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update status.');
    }
  };

  // One-time idempotent per-city seed: skips hotels whose name+city already exist (no duplicates ever)
  const handleSeedCity = async (city: 'Makkah' | 'Madinah') => {
    if (!userProfile) return;
    const list = city === 'Makkah' ? MAKKAH_HOTELS_SEED : MADINAH_HOTELS_SEED;
    setSeeding(true);
    try {
      const existing = await fetchHotels();
      const seen = new Set(existing.map((h) => `${h.name.trim().toLowerCase()}|${(h.city || '').trim().toLowerCase()}`));
      let added = 0;
      let skipped = 0;
      for (const item of list) {
        const key = `${item.name.trim().toLowerCase()}|${(item.city || '').trim().toLowerCase()}`;
        if (seen.has(key)) { skipped++; continue; }
        await createHotel(userProfile, item as any);
        seen.add(key);
        added++;
      }
      if (added > 0) {
        success(`Seeded ${added} ${city} hotels${skipped > 0 ? ` (${skipped} already existed — skipped)` : ''}. Now link each hotel to its vendor from Edit.`);
      } else {
        info(`All ${list.length} ${city} hotels already exist — nothing to seed. No duplicates created.`);
      }
      await loadData();
    } catch (err: any) {
      showError('Failed to seed inventory.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={lockedCity ? `${cityLabel} Hotels` : 'Hotel Inventory'}
        subtitle={lockedCity ? `${cityLabel} hotel inventory — seed ${cityLabel} hotels, link each hotel to its Shirka/vendor, set contracted bed rates.` : 'Makkah & Madinah hotel inventory — link each hotel to its Shirka/vendor, set contracted bed rates, track availability.'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Inventory', href: '/inventory' },
          ...(lockedCity ? [{ label: `${cityLabel} Hotels` }] : [{ label: 'Hotels' }]),
        ]}
        actions={
          <div className="flex items-center gap-2">
            {(!lockedCity || lockedCity === 'Makkah') && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
                onClick={() => handleSeedCity('Makkah')}
                loading={seeding}
              >
                Seed Makkah Hotels
              </Button>
            )}
            {(!lockedCity || lockedCity === 'Madinah') && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
                onClick={() => handleSeedCity('Madinah')}
                loading={seeding}
              >
                Seed Madina Hotels
              </Button>
            )}
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleOpenAdd}
                className="bg-[#0e2c4c] hover:bg-[#1a4473]"
              >
                + Add Hotel
              </Button>
            )}
          </div>
        }
      />

      {/* Filters Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hotel name, city, Shirka vendor..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none"
            />
          </div>

          <div>
            {lockedCity ? (
              <div className="w-full p-2 bg-[#0e2c4c] text-white rounded-lg text-xs font-bold text-center">
                {cityLabel} Hotels ({hotels.filter(h => h.city.toLowerCase() === lockedCity.toLowerCase()).length})
              </div>
            ) : (
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="Makkah">Makkah Hotels ({hotels.filter(h => h.city.toLowerCase() === 'makkah').length})</option>
                <option value="Madinah">Madina Hotels ({hotels.filter(h => h.city.toLowerCase() === 'madinah').length})</option>
                <option value="Other">Other Cities ({hotels.filter(h => !['makkah', 'madinah'].includes(h.city.toLowerCase())).length})</option>
              </select>
            )}
          </div>
        </div>
      </Card>

      {/* Hotels Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">Hotel Name & City</th>
                <th className="py-3 px-3 text-center">Stars</th>
                <th className="py-3 px-3">Shirka Vendor</th>
                <th className="py-3 px-3">Bed Types & Nightly Rates (SAR)</th>
                <th className="py-3 px-3">Availability Note</th>
                <th className="py-3 px-3 text-center">Used Count</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading hotels directory...
                  </td>
                </tr>
              ) : filteredHotels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No hotels found matching criteria. Click "Seed Makkah & Madinah Inventory" to load hotels.
                  </td>
                </tr>
              ) : (
                filteredHotels.map((h, idx) => {
                  const vendorObj = vendorMap.get(h.vendorId);
                  return (
                    <tr key={h.id || idx} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 text-sm">{h.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-semibold text-[#0e2c4c]">{h.city}</span>
                          <span>•</span>
                          <span>{h.distanceFromHaram || 'Near Haram'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-0.5 text-amber-500 font-bold">
                          {h.starRating} <Star className="w-3 h-3 fill-amber-400" />
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{vendorObj?.name || 'Shirka Vendor'}</div>
                        <div className="text-[10px] font-mono text-slate-500">{vendorObj?.vendorCode}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {h.roomTypes?.map((rt, i) => (
                            <span key={i} className="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[10px] font-mono">
                              <strong>{rt.bedType}:</strong> SAR {rt.nightlyRateSAR}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        {h.availabilityNote || 'Available'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-mono font-bold text-[#0e2c4c]">
                        {h.usedFromCount || 0} Vouchers
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(h)}
                          className="cursor-pointer"
                        >
                          <Badge variant={h.isActive ? 'success' : 'danger'} size="sm">
                            {h.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(h)}
                              className="p-1 text-slate-500 hover:text-[#0e2c4c] rounded transition cursor-pointer"
                              title="Edit Hotel"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteOrDeactivate(h)}
                            className="p-1 text-slate-500 hover:text-rose-600 rounded transition cursor-pointer"
                            title={h.usedFromCount > 0 ? 'Deactivate Hotel' : 'Delete Hotel'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Hotel Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingHotel ? `Edit Hotel: ${editingHotel.name}` : 'Add New Contracted Hotel'}
        subtitle="Provide hotel properties, Shirka supplier binding, and nightly bed type rates."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveHotel}
              loading={saving}
              className="bg-[#0e2c4c] hover:bg-[#1a4473] text-white font-bold"
            >
              {editingHotel ? 'Save Changes' : 'Create Hotel'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveHotel} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Hotel Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fairmont Makkah Clock Tower"
                required
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">City *</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
              >
                <option value="Makkah">Makkah</option>
                <option value="Madinah">Madinah</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Star Rating *</label>
              <select
                value={starRating}
                onChange={(e) => setStarRating(parseInt(e.target.value, 10) as any)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold"
              >
                <option value={5}>5 Star Deluxe</option>
                <option value={4}>4 Star Executive</option>
                <option value={3}>3 Star Standard</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Shirka / Vendor Source *</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                required
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold"
              >
                <option value="">-- Select Shirka Vendor --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.vendorCode})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Distance from Haram</label>
              <input
                type="text"
                value={distanceFromHaram}
                onChange={(e) => setDistanceFromHaram(e.target.value)}
                placeholder="e.g. 50 meters or Zero meters"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Availability Note</label>
              <input
                type="text"
                value={availabilityNote}
                onChange={(e) => setAvailabilityNote(e.target.value)}
                placeholder="e.g. Available till 25-Nov"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Contact Phone</label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. +966 12 571 7000"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          {/* Room Types & Nightly Rates */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
              Bed Types & Reference Nightly Rates (SAR)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {roomTypes.map((rt, idx) => (
                <div key={rt.bedType} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">{rt.bedType} Room</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={rt.nightlyRateSAR}
                    onChange={(e) => {
                      const updated = [...roomTypes];
                      updated[idx].nightlyRateSAR = parseFloat(e.target.value) || 0;
                      setRoomTypes(updated);
                    }}
                    className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-[#0e2c4c]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Notes / Additional Info</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal remarks regarding room allocations..."
              rows={2}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActiveHotel"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-[#0e2c4c]"
            />
            <label htmlFor="isActiveHotel" className="text-xs font-semibold text-slate-700 cursor-pointer">
              Active Hotel (Available for booking selection)
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
};
