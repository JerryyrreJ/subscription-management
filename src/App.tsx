import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Subscription, ViewMode } from './types';
import { Dashboard } from './components/Dashboard';
import { AddSubscriptionModal } from './components/AddSubscriptionModal';
import { SubscriptionCard } from './components/SubscriptionCard';
import { SubscriptionDetailsModal } from './components/SubscriptionDetailsModal';
import { EditSubscriptionModal } from './components/EditSubscriptionModal';
import { loadSubscriptions, saveSubscriptions } from './utils/storage';

export function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setSubscriptions(loadSubscriptions());
  }, []);

  const handleAddSubscription = (subscription: Subscription) => {
    const updatedSubscriptions = [...subscriptions, subscription];
    setSubscriptions(updatedSubscriptions);
    saveSubscriptions(updatedSubscriptions);
    setIsAddModalOpen(false);
  };

  const handleDeleteSubscription = () => {
    if (selectedSubscription) {
      const updatedSubscriptions = subscriptions.filter(s => s.id !== selectedSubscription.id);
      setSubscriptions(updatedSubscriptions);
      saveSubscriptions(updatedSubscriptions);
      setSelectedSubscription(null);
    }
  };

  const handleEditSubscription = (updatedSubscription: Subscription) => {
    const updatedSubscriptions = subscriptions.map(sub =>
      sub.id === updatedSubscription.id ? updatedSubscription : sub
    );
    setSubscriptions(updatedSubscriptions);
    saveSubscriptions(updatedSubscriptions);
    setSelectedSubscription(null);
    setIsEditModalOpen(false);
  };

  const handleEditClick = () => {
    setIsEditModalOpen(true);
  };

  const handleAutoRenew = (
    subscriptionId: string, 
    newDates: { lastPaymentDate: string; nextPaymentDate: string }
  ) => {
    const updatedSubscriptions = subscriptions.map(sub =>
      sub.id === subscriptionId
        ? { ...sub, ...newDates }
        : sub
    );
    setSubscriptions(updatedSubscriptions);
    saveSubscriptions(updatedSubscriptions);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <Dashboard
          subscriptions={subscriptions}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((subscription, index) => (
            <SubscriptionCard
              key={subscription.id}
              subscription={subscription}
              index={index}
              onClick={() => setSelectedSubscription(subscription)}
              onAutoRenew={handleAutoRenew}
            />
          ))}
          
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="group h-[250px] bg-white rounded-xl shadow-lg p-6 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:scale-105 hover:shadow-xl"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
              <Plus className="w-8 h-8 text-indigo-600" />
            </div>
            <p className="text-gray-600 font-medium">
              {subscriptions.length === 0
                ? "Add your first subscription"
                : "Add a subscription"}
            </p>
          </button>
        </div>

        <AddSubscriptionModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddSubscription}
        />

        <SubscriptionDetailsModal
          isOpen={selectedSubscription !== null}
          subscription={selectedSubscription!}
          onClose={() => setSelectedSubscription(null)}
          onEdit={handleEditClick}
          onDelete={handleDeleteSubscription}
        />

        {selectedSubscription && (
          <EditSubscriptionModal
            subscription={selectedSubscription}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onEdit={handleEditSubscription}
          />
        )}
      </div>
    </div>
  );
}