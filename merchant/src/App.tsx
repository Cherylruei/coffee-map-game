import { useState } from 'react';
import { StaffInfo } from './types';
import { LoginPage } from './components/LoginPage';
import { OrderTab } from './components/OrderTab';
import { GachaTab } from './components/GachaTab';
import { StatsTab } from './components/StatsTab';
import { InventoryTab } from './components/InventoryTab';
import { MenuTab } from './components/MenuTab';

type Tab = 'order' | 'qr' | 'stats' | 'inventory' | 'menu';

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('order');
  const [statsRefresh, setStatsRefresh] = useState(0);
  const [qrViewerOpen, setQrViewerOpen] = useState(false);

  function handleLogin(token: string, staff: StaffInfo | null) {
    setSessionToken(token);
    setStaffInfo(staff);
    setActiveTab('order');
  }

  function logout() {
    setSessionToken(null);
    setStaffInfo(null);
    setActiveTab('order');
  }

  function triggerStatsRefresh() {
    setStatsRefresh((n) => n + 1);
  }

  if (!sessionToken) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className='app-shell'>
      {/* Top Bar */}
      <div className='top-bar'>
        {staffInfo ? (
          <div className='staff-badge'>
            {staffInfo.picture && <img src={staffInfo.picture} alt='' />}
            {staffInfo.name}
          </div>
        ) : (
          <h1>☕ 後台</h1>
        )}
        <button className='logout-btn' onClick={logout}>
          登出
        </button>
      </div>

      {/* Panels */}
      <div className='panels'>
        <div className={`panel${activeTab === 'order' ? ' active' : ''}`}>
          <OrderTab
            sessionToken={sessionToken}
            staffName={staffInfo?.name || '未識別員工'}
            staffLineId={staffInfo?.lineId || null}
            onOrderCommitted={triggerStatsRefresh}
            onQRViewerChange={setQrViewerOpen}
          />
        </div>

        <div className={`panel${activeTab === 'qr' ? ' active' : ''}`}>
          <GachaTab
            sessionToken={sessionToken}
            onGenerated={triggerStatsRefresh}
          />
        </div>

        <div className={`panel${activeTab === 'stats' ? ' active' : ''}`}>
          <StatsTab sessionToken={sessionToken} refreshSignal={statsRefresh} />
        </div>

        <div className={`panel${activeTab === 'inventory' ? ' active' : ''}`}>
          <InventoryTab
            sessionToken={sessionToken}
            staffName={staffInfo?.name || '未識別員工'}
            refreshSignal={statsRefresh}
          />
        </div>

        <div className={`panel${activeTab === 'menu' ? ' active' : ''}`}>
          <MenuTab sessionToken={sessionToken} />
        </div>
      </div>

      {/* Tab Nav */}
      {!qrViewerOpen && (
      <nav className='tab-nav'>
        <button
          className={`tab-btn${activeTab === 'order' ? ' active' : ''}`}
          onClick={() => setActiveTab('order')}
          aria-label='點單'
        >
          📋
        </button>
        <button
          className={`tab-btn${activeTab === 'qr' ? ' active' : ''}`}
          onClick={() => setActiveTab('qr')}
          aria-label='抽卡'
        >
          🎴
        </button>
        <button
          className={`tab-btn${activeTab === 'stats' ? ' active' : ''}`}
          onClick={() => setActiveTab('stats')}
          aria-label='統計'
        >
          📊
        </button>
        <button
          className={`tab-btn${activeTab === 'inventory' ? ' active' : ''}`}
          onClick={() => setActiveTab('inventory')}
          aria-label='盤點'
        >
          📦
        </button>
        <button
          className={`tab-btn${activeTab === 'menu' ? ' active' : ''}`}
          onClick={() => setActiveTab('menu')}
          aria-label='菜單'
        >
          🍽️
        </button>
      </nav>
      )}
    </div>
  );
}
