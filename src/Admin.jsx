import { useState, useEffect, useRef } from 'react' 
import { db } from './firebase'
import { 
  collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, where, serverTimestamp, setDoc, getDoc, writeBatch, getDocs 
} from 'firebase/firestore'
import './Admin.css'

const ADMIN_PIN = '8888';
const APP_VERSION = 'v1.1.0 (Sound On)'; 
const MASTER_CATEGORIES = [
  'อาหารจานเดียว', 'ก๋วยเตี๋ยว', 'กับข้าว', 'ท็อปปิ้ง', 
  'ส้มตำ/ยำ', 'สเต็ก', 'เครื่องดื่ม', 'น้ำปั่น', 'กาแฟ/คาเฟ่', 'ของหวาน'
];

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function Admin() {
  const [tab, setTab] = useState('kitchen')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([]) 
  const [historyList, setHistoryList] = useState([]) 
  const [dailySalesLog, setDailySalesLog] = useState([]) 
  const [selectedDate, setSelectedDate] = useState(getTodayStr()) 

  const [enabledCategories, setEnabledCategories] = useState(['อาหารจานเดียว', 'เครื่องดื่ม'])
  const [formData, setFormData] = useState({ name: '', price: '', category: 'อาหารจานเดียว', img: '' })
  const [editId, setEditId] = useState(null)
  const [isMenuLocked, setIsMenuLocked] = useState(true)
  const [pinInput, setPinInput] = useState('')

  // 👇 ตัวแปรสำหรับระบบแจ้งเตือนเสียง
  const prevOrderCountRef = useRef(0);
  const isFirstLoad = useRef(true); // กันไม่ให้เสียงดังตอนเพิ่งเปิดเว็บ

  useEffect(() => {
    // โหลดสินค้า
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // 👇 แก้ไขส่วนโหลดออเดอร์ ให้มีเสียงเตือน
    const unsubOrders = onSnapshot(query(collection(db, "orders"), orderBy("timestamp", "asc")), (snap) => {
        const newOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // เช็กว่าเป็นครั้งแรกที่โหลดหน้าเว็บไหม?
        if (isFirstLoad.current) {
            isFirstLoad.current = false;
            prevOrderCountRef.current = newOrders.length;
        } else {
            // ถ้าไม่ใช่ครั้งแรก และออเดอร์เพิ่มขึ้น -> เล่นเสียง!
            if (newOrders.length > prevOrderCountRef.current) {
                playSound();
            }
            prevOrderCountRef.current = newOrders.length;
        }
        
        setOrders(newOrders);
    });
    
    // โหลดประวัติ
    const qHistory = query(collection(db, "history_orders"), where("dateLabel", "==", selectedDate));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.finishedAt?.seconds || 0) - (a.finishedAt?.seconds || 0));
        setHistoryList(list);
    });

    // โหลด Log ยอดขาย
    const unsubSalesLog = onSnapshot(query(collection(db, "daily_sales"), orderBy("timestamp", "desc")), (snap) => setDailySalesLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    getDoc(doc(db, "settings", "shopConfig")).then(docSnap => {
      if (docSnap.exists() && docSnap.data().categories) setEnabledCategories(docSnap.data().categories);
    });

    return () => { unsubProducts(); unsubOrders(); unsubSalesLog(); unsubHistory(); };
  }, [selectedDate]) 

  // 👇 ฟังก์ชันเล่นเสียง (เรียกไฟล์ alert.wav จากโฟลเดอร์ public)
  const playSound = () => {
    try {
        const audio = new Audio('/alert.wav'); // 🔔 ตรวจสอบชื่อไฟล์ให้ตรงกับที่วางใน public
        audio.play().catch(e => console.log("Audio Error (Chrome might block auto-play):", e));
    } catch (err) {
        console.error("Sound Error:", err);
    }
  }

  const markAsServed = async (order) => { 
    if (!confirm('ยืนยันเสิร์ฟและปิดบิล?')) return; 
    try {
        const todayStr = getTodayStr(); 
        await addDoc(collection(db, "history_orders"), {
            ...order,
            finishedAt: serverTimestamp(),
            status: 'served',
            dateLabel: todayStr 
        });
        await deleteDoc(doc(db, "orders", order.id));
        // ลดจำนวนที่จำไว้ เพื่อให้ระบบรู้ว่าออเดอร์หายไป 1 (เดี๋ยวพอลูกค้าสั่งมาใหม่จะได้ดัง)
        prevOrderCountRef.current = Math.max(0, prevOrderCountRef.current - 1);
    } catch (err) {
        console.error("Error serving:", err);
        alert("เกิดข้อผิดพลาด: " + err.message);
    }
  }

  // ... (ฟังก์ชันอื่นๆ เหมือนเดิมเป๊ะ)
  const handleCloseDay = async () => {
    if (!confirm(`ยืนยันรวมยอดของวันที่ ${selectedDate} และล้างประวัติ?`)) return;
    try {
        const q = query(collection(db, "history_orders"), where("dateLabel", "==", selectedDate));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return alert("ไม่พบรายการบิลในระบบ");

        const realOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const totalSales = realOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
        const totalOrders = realOrders.length;
        
        const itemCounts = {};
        realOrders.forEach(o => o.items.forEach(i => itemCounts[i.name] = (itemCounts[i.name] || 0) + (i.qty || 1)));
        const topMenu = Object.entries(itemCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([n, c]) => `${n}(${c})`).join(', ');

        const batch = writeBatch(db);
        const newSummaryRef = doc(collection(db, "daily_sales"));
        batch.set(newSummaryRef, {
            timestamp: serverTimestamp(),
            date_string: new Date(selectedDate).toLocaleDateString('th-TH'),
            total_sales: totalSales,
            total_orders: totalOrders,
            top_menu: topMenu
        });

        snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();

        alert("✅ บันทึกยอดและเคลียร์ประวัติเรียบร้อย!");
        setTab('dashboard'); 
    } catch (error) {
        console.error("Error closing day:", error);
        alert("เกิดข้อผิดพลาด: " + error.message);
    }
  }

  const deleteSalesLog = async (id) => {
      if(!confirm("ต้องการลบบันทึกยอดขายนี้ใช่ไหม? (กู้คืนไม่ได้)")) return;
      try { await deleteDoc(doc(db, "daily_sales", id)); } catch (error) { alert("ลบไม่สำเร็จ"); }
  }

  const exportSingleLogToCSV = (log) => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    csvContent += "Date,Total Sales,Bills,Top Menu\n";
    const row = `${log.date_string},${log.total_sales},${log.total_orders},"${log.top_menu}"`;
    csvContent += row;
    const fileNameDate = log.date_string.replace(/\//g, '-'); 
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_${fileNameDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const toggleCategory = async (cat) => {
    const newCats = enabledCategories.includes(cat) ? enabledCategories.filter(c => c !== cat) : [...enabledCategories, cat];
    setEnabledCategories(newCats);
    await setDoc(doc(db, "settings", "shopConfig"), { categories: newCats }, { merge: true });
  }
  const handleSave = async (e) => {
    e.preventDefault();
    const payload = { ...formData, price: Number(formData.price), available: true };
    if (editId) { await updateDoc(doc(db, "products", editId), payload); setEditId(null); } 
    else { await addDoc(collection(db, "products"), payload); }
    setFormData({ ...formData, name: '', price: '', category: 'อาหารจานเดียว', img: '' }); 
    alert('บันทึกเรียบร้อย');
  }
  const startEdit = (item) => { setFormData({ name: item.name, price: item.price, category: item.category, img: item.img || '' }); setEditId(item.id); setTab('menu'); window.scrollTo(0, 0); }
  const toggleAvailable = async (item) => await updateDoc(doc(db, "products", item.id), { available: !item.available });
  const handleDelete = async (id) => { if (confirm('ยืนยันลบเมนู?')) await deleteDoc(doc(db, "products", id)); }
  const handlePinPress = (num) => {
    const nextPin = pinInput + num; setPinInput(nextPin);
    if (nextPin.length === 4) {
      if (nextPin === ADMIN_PIN) { setTimeout(() => { setIsMenuLocked(false); setPinInput(''); }, 200); } 
      else { setTimeout(() => { alert('รหัสผิด'); setPinInput(''); }, 200); }
    }
  }

  const currentStats = {
      total: historyList.reduce((sum, o) => sum + (o.total_price || 0), 0),
      count: historyList.length
  };

  return (
    <div className="admin-container">
      <div className="admin-sidebar">
        <h2 className="sidebar-title">⚡ POS System</h2>
        <div onClick={() => setTab('kitchen')} className={`menu-item ${tab === 'kitchen' ? 'active' : ''}`}>🍳 ออเดอร์เข้า ({orders.length})</div>
        <div onClick={() => setTab('history')} className={`menu-item ${tab === 'history' ? 'active' : ''}`}>📜 ประวัติบิล</div>
        <div onClick={() => { setTab('menu'); setIsMenuLocked(true); }} className={`menu-item ${tab === 'menu' ? 'active' : ''}`}>🍔 เมนู 🔒</div>
        <div onClick={() => setTab('dashboard')} className={`menu-item ${tab === 'dashboard' ? 'active' : ''}`}>📊 ยอดขาย</div>
        
        <div className="version-tag">
           Ver: {APP_VERSION}
        </div>
      </div>

      <div className="admin-content">
        <h1 className="page-title">
          {tab === 'kitchen' ? '👨‍🍳 ออเดอร์รอเสิร์ฟ' : 
           tab === 'history' ? '📜 ประวัติบิลย้อนหลัง' :
           tab === 'menu' ? '⚙️ จัดการร้าน' : '📊 สรุปยอดขาย'}
        </h1>

        {/* --- KITCHEN TAB --- */}
        {tab === 'kitchen' && (
          <div className="kitchen-grid">
            {orders.length === 0 ? (
              <div className="empty-state"><h2>✅ ครัวว่างครับ!</h2><p>รอออเดอร์ลูกค้า...</p></div>
            ) : orders.map((order) => (
              <div key={order.id} className={`admin-card order-card ${order.status === 'cooked' ? 'cooked-highlight' : ''}`}>
                <div className="card-header">
                  <span className="table-no">โต๊ะ {order.table_no}</span>
                  {order.status === 'cooked' && <span className="badge-cooked">ครัวทำเสร็จแล้ว</span>}
                  <span className="order-time">{order.timestamp?.seconds ? new Date(order.timestamp.seconds * 1000).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : ''}</span>
                </div>
                <ul className="order-list">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="order-item">
                      {item.name} <span className="item-cat">({item.category})</span> <span style={{color:'orange'}}>x{item.qty||1}</span>
                      {item.note && <div className="item-note">⚠️ {item.note}</div>}
                    </li>
                  ))}
                </ul>
                <button onClick={() => markAsServed(order)} className="btn-primary full-width">เสิร์ฟ</button> {/* ⬅️ แก้ไขแล้ว */}
              </div>
            ))}
          </div>
        )}

        {/* ส่วน Tab อื่นๆ (History, Menu, Dashboard) เหมือนเดิม */}
        {tab === 'history' && (
           <div className="vertical-stack">
             <div className="history-controls admin-card">
                <div className="date-picker-group">
                    <span>📅 เลือกวันที่:</span>
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="date-input" />
                </div>
                <button onClick={handleCloseDay} className="btn-primary" style={{marginLeft:'auto'}}>✅ สรุปยอดลงบัญชี</button>
             </div>
             <div className="history-summary mb-20">
                ยอดรวม: <span className="accent" style={{fontSize:'24px'}}>฿{currentStats.total.toLocaleString()}</span> 
                <span className="text-sm" style={{marginLeft:'10px'}}>({currentStats.count} บิล)</span>
             </div>
             <div className="kitchen-grid">
               {historyList.length === 0 ? ( 
                  <div className="empty-state">❌ ไม่พบบิลของวันที่ {selectedDate}</div> 
               ) : historyList.map((order) => (
                 <div key={order.id} className="admin-card order-done">
                    <div className="card-header">
                       <div><span className="table-no">โต๊ะ {order.table_no}</span><div className="text-sm">{order.finishedAt?.seconds ? new Date(order.finishedAt.seconds * 1000).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '-'} น.</div></div>
                       <div className="accent" style={{fontSize:'1.4rem', fontWeight:'bold'}}>฿{order.total_price}</div>
                    </div>
                    <ul className="order-list" style={{opacity: 0.8}}>
                       {order.items.map((item, idx) => <li key={idx} className="order-item" style={{fontSize:'1rem', borderBottom:'1px dashed #444', paddingBottom:'4px'}}>{item.name} x{item.qty||1}</li>)}
                    </ul>
                 </div>
               ))}
             </div>
           </div>
        )}

        {tab === 'menu' && (
          isMenuLocked ? (
            <div className="pin-wrapper">
              <div className="admin-card pin-card">
                <h2>🔒 ใส่รหัสผ่าน</h2>
                <div className="pin-dots">{'•'.repeat(pinInput.length)}</div>
                <div className="numpad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0].map(n => (
                    <button key={n} onClick={() => n === 'C' ? setPinInput('') : handlePinPress(n.toString())} className={`num-btn ${n === 'C' ? 'btn-clear' : ''}`}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="menu-layout-2col">
              <div className="menu-left-panel">
                <div className="admin-card mb-20">
                  <h3 className="card-title">⚙️ เลือกร้านขายอะไรบ้าง?</h3>
                  <div className="cat-tags">
                    {MASTER_CATEGORIES.map(cat => (
                      <label key={cat} className={`cat-chip ${enabledCategories.includes(cat) ? 'active' : ''}`}>
                        <input type="checkbox" checked={enabledCategories.includes(cat)} onChange={() => toggleCategory(cat)} />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="admin-card sticky-top">
                  <h3 className="card-title">{editId ? '✏️ แก้ไขเมนู' : '➕ เพิ่มเมนูใหม่'}</h3>
                  <form onSubmit={handleSave} className="form-vertical">
                    <input className="input-field" placeholder="ชื่อเมนู" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    <input className="input-field" type="number" placeholder="ราคา" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} required />
                    <select className="input-field" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                      {enabledCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      {!enabledCategories.includes(formData.category) && <option value={formData.category}>{formData.category}</option>}
                    </select>
                    <input className="input-field" placeholder="URL รูปภาพ" value={formData.img} onChange={e => setFormData({ ...formData, img: e.target.value })} />
                    <button type="submit" className={`btn-primary full-width ${editId ? 'btn-warn' : ''}`}>{editId ? 'บันทึกแก้ไข' : 'เพิ่มเมนู'}</button>
                  </form>
                </div>
              </div>
              <div className="menu-right-panel">
                {products.map(p => (
                  <div key={p.id} className={`admin-card product-row ${!p.available ? 'disabled' : ''}`}>
                    <div className="product-left">
                      <img src={p.img || 'https://via.placeholder.com/60'} className="product-img" />
                      <div>
                        <div className="product-name">{p.name} {!p.available && <span className="tag-out">หมด</span>}</div>
                        <div className="product-price">{p.category} | <span>{p.price}.-</span></div>
                      </div>
                    </div>
                    <div className="product-actions">
                      <button onClick={() => toggleAvailable(p)} className="btn-icon">{!p.available ? 'ขาย' : 'หมด'}</button>
                      <button onClick={() => startEdit(p)} className="btn-icon">แก้ไข</button>
                      <button onClick={() => handleDelete(p.id)} className="btn-icon btn-del">ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {tab === 'dashboard' && (
          <div className="vertical-stack">
            <div className="admin-card">
              <h3>📜 บันทึกสรุปยอดขาย (Past Logs)</h3>
              <table className="history-table">
                <thead><tr><th>วันที่</th><th>ยอดขาย</th><th>บิล</th><th>เมนูฮิต (Text)</th><th>จัดการ</th></tr></thead>
                <tbody>
                  {dailySalesLog.map((log) => (
                    <tr key={log.id}>
                      <td>{log.date_string}</td>
                      <td className="accent">฿{log.total_sales.toLocaleString()}</td>
                      <td>{log.total_orders}</td>
                      <td className="text-sm">{log.top_menu}</td>
                      <td>
                          <button onClick={() => exportSingleLogToCSV(log)} className="btn-icon" style={{marginRight:'8px', borderColor:'#00e676', color:'#00e676'}}>📥 โหลด</button>
                          <button onClick={() => deleteSalesLog(log.id)} className="btn-icon btn-del">🗑️ ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Admin