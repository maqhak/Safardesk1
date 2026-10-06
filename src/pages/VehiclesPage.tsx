import React, { useState, useEffect } from 'react';
import { 
  Bus, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Info
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { VehicleDoc } from '../types/master';
import { fetchVehicles, createVehicle, updateVehicle, toggleVehicleStatus, deleteVehicle } from '../services/masterService';

export const VehiclesPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { success, error, info } = useToast();
  const canCreate = useCan('Masters', 'create');
  const canEdit = useCan('Masters', 'edit');

  const [vehicles, setVehicles] = useState<VehicleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleDoc | null>(null);

  // Form State
  const [vehicleType, setVehicleType] = useState<'Car' | 'Staria' | 'Hiace' | 'Coaster' | 'Bus' | 'GMC'>('Car');
  const [seatCount, setSeatCount] = useState<number>(4);
  const [referenceRateSAR, setReferenceRateSAR] = useState<number>(250);
  const [description, setDescription] = useState('');

  // Delete Confirm State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleDoc | null>(null);

  const loadData = () => {
    setLoading(true);
    fetchVehicles()
      .then(setVehicles)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setVehicleType('Car');
    setSeatCount(4);
    setReferenceRateSAR(250);
    setDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: VehicleDoc) => {
    setEditingVehicle(v);
    setVehicleType(v.vehicleType);
    setSeatCount(v.seatCount);
    setReferenceRateSAR(v.referenceRateSAR);
    setDescription(v.description || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    try {
      if (editingVehicle) {
        await updateVehicle(userProfile, editingVehicle.id, {
          vehicleType,
          seatCount,
          referenceRateSAR,
          description,
        });
        success(`Vehicle type "${vehicleType}" updated successfully.`);
      } else {
        await createVehicle(userProfile, {
          vehicleType,
          seatCount,
          referenceRateSAR,
          description,
        });
        success(`Vehicle type "${vehicleType}" created successfully.`);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      error(err.message || 'Failed to save vehicle');
    }
  };

  const handleToggleStatus = async (v: VehicleDoc) => {
    if (!userProfile) return;
    try {
      await toggleVehicleStatus(userProfile, v.id);
      success(`Vehicle status updated.`);
      loadData();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleDeleteClick = (v: VehicleDoc) => {
    setVehicleToDelete(v);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userProfile || !vehicleToDelete) return;
    try {
      await deleteVehicle(userProfile, vehicleToDelete.id);
      success('Vehicle deleted successfully.');
      setDeleteConfirmOpen(false);
      setVehicleToDelete(null);
      loadData();
    } catch (err: any) {
      error(err.message || 'Cannot delete referenced vehicle.');
      setDeleteConfirmOpen(false);
    }
  };

  const filteredVehicles = vehicles.filter(v =>
    v.vehicleType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vehicles by type or description..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        </div>

        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleOpenAdd}
          >
            Add Vehicle Type
          </Button>
        )}
      </div>

      {/* Informational Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block mb-0.5">Transport Reference Rates (Informational Only)</span>
          Reference rates shown here are guide benchmarks. Voucher transport rates are always typed manually by staff during voucher creation and are never auto-filled.
        </div>
      </div>

      {/* Vehicles Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="p-4">Vehicle Type</th>
                <th className="p-4">Seat Capacity</th>
                <th className="p-4">Reference Rate (SAR)</th>
                <th className="p-4">Description</th>
                <th className="p-4">Used Count</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">Loading vehicles directory...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">No vehicle master records found.</td>
                </tr>
              ) : (
                filteredVehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 font-bold text-[var(--theme-primary)] flex items-center gap-2">
                      <Bus className="w-4 h-4 text-slate-400" />
                      {v.vehicleType}
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-900">{v.seatCount} Seats</td>
                    <td className="p-4 font-mono font-bold text-[#c9a227]">SAR {v.referenceRateSAR}</td>
                    <td className="p-4 text-slate-600 max-w-xs truncate">{v.description}</td>
                    <td className="p-4 font-mono">
                      <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full text-[11px]">
                        {v.usedFromCount || 0} Vouchers
                      </span>
                    </td>
                    <td className="p-4">
                      {v.isActive ? (
                        <Badge variant="success" size="sm">Active</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">Inactive</Badge>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(v)}
                            className="p-1.5 text-slate-500 hover:text-[var(--theme-primary)] hover:bg-slate-100 rounded-lg transition"
                            title="Edit Vehicle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(v)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
                            title={v.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {v.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteClick(v)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                            title="Delete Vehicle"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVehicle ? 'Edit Vehicle Type' : 'Add New Vehicle Type'}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Vehicle Type</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
            >
              <option value="Car">Car (Sedan)</option>
              <option value="Staria">Staria (VIP Van)</option>
              <option value="Hiace">Hiace (High Roof)</option>
              <option value="Coaster">Coaster (AC Bus)</option>
              <option value="Bus">Bus (49-Seater Luxury)</option>
              <option value="GMC">GMC (VIP SUV)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Seat Capacity</label>
              <input
                type="number"
                min={1}
                required
                value={seatCount}
                onChange={(e) => setSeatCount(parseInt(e.target.value) || 1)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Reference Rate (SAR)</label>
              <input
                type="number"
                min={0}
                required
                value={referenceRateSAR}
                onChange={(e) => setReferenceRateSAR(parseFloat(e.target.value) || 0)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Description & Notes</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Hyundai Staria VIP Van with luggage capacity..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm">Save Vehicle</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Vehicle Type"
        message={`Are you sure you want to delete vehicle type "${vehicleToDelete?.vehicleType}"? If this vehicle is referenced in vouchers, deletion will be blocked and deactivation will be recommended.`}
        confirmLabel="Delete Vehicle"
        variant="danger"
      />
    </div>
  );
};
