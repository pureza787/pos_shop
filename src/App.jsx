import { useState, useEffect, useRef } from 'react'
import { db } from './firebase'
import { 
  collection, addDoc, serverTimestamp, query, where, onSnapshot, 
  deleteDoc, doc, orderBy 
} from 'firebase/firestore'
import './App.css'

function App() {
  // --- 1. State Variables ---
  const [cart, setCart] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [isOrdering, setIsOrdering] = useState(false)
  const [showCartDetails, setShowCartDetails] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  
  // --- 2. Category ---
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด')
  const [activeCategories, setActiveCategories] = useState([])
  const CATEGORIES = ['ทั้งหมด', ...activeCategories]

  // --- 3. Noodle Popup State (อัปเดตใหม่) ---
  const [showNoodleModal, setShowNoodleModal] = useState(false)
  const [selectedNoodleDish, setSelectedNoodleDish] = useState(null)
  
  // ตัวเลือกก๋วยเตี๋ยว
  const [noodleType, setNoodleType] = useState('เส้นเล็ก')
  const [soupType, setSoupType] = useState('น้ำใส')
  const [noodleSize, setNoodleSize] = useState('ธรรมดา') // ธรรมดา, พิเศษ
  const [noodleOptions, setNoodleOptions] = useState([]) // เก็บตัวเลือกเสริม (ไม่ผัก, ไม่กระเทียม ฯลฯ)
  const [noodleQty, setNoodleQty] = useState(1) // จำนวนชาม

  // ข้อมูลตัวเลือก (Constants)
  const NOODLE_LIST = ['เส้นเล็ก', 'เส้นหมี่', 'เส้นใหญ่', 'บะหมี่', 'วุ้นเส้น', 'มาม่า', 'เกาเหลา'];
  const SOUP_LIST = ['น้ำใส', 'น้ำตก', 'ต้มยำ', 'ต้มยำน้ำข้น', 'แห้ง'];
  const EXTRA_LIST = ['ไม่ใส่ผัก', 'ไม่ใส่กระเทียมเจียว', 'ไม่ชูรส', 'เผ็ดน้อย', 'เผ็ดมาก'];

  // --- 4. Drag Scroll ---
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // --- 5. Initial Data ---
  const params = new URLSearchParams(window.location.search);
  const tableNo = params.get('table') || '1';

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSettings = onSnapshot(doc(db, "settings", "shopConfig"), (d) => {
       if (d.exists() && d.data().categories) setActiveCategories(d.data().categories); 
       else setActiveCategories(['อาหารจานเดียว', 'ก๋วยเตี๋ยว', 'เครื่องดื่ม']);
    });
    const qOrder = query(collection(db, "orders"), where("table_no", "==", tableNo), orderBy("timestamp", "desc"));
    const unsubOrders = onSnapshot(qOrder, (snap) => setMyOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubProducts(); unsubSettings(); unsubOrders(); };
  }, [tableNo])

  // --- 6. Logic ---
  const handleMouseDown = (e) => { setIsDragging(true); setStartX(e.pageX - scrollRef.current.offsetLeft); setScrollLeft(scrollRef.current.scrollLeft); };
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseMove = (e) => { if (!isDragging) return; e.preventDefault(); const x = e.pageX - scrollRef.current.offsetLeft; const walk = (x - startX) * 2; scrollRef.current.scrollLeft = scrollLeft - walk; };

  // Cart Logic
  const handleItemClick = (item) => {
    if (item.category === 'ก๋วยเตี๋ยว') {
      // Reset ค่าทุกครั้งที่กดเลือกใหม่
      setSelectedNoodleDish(item); 
      setNoodleType('เส้นเล็ก'); 
      setSoupType('น้ำใส');
      setNoodleSize('ธรรมดา');
      setNoodleOptions([]);
      setNoodleQty(1);
      setShowNoodleModal(true);
    } else {
      addToCart(item); 
    }
  }

  const addToCart = (item, customNote = '') => {
    setCart(prev => [...prev, { ...item, uniqueId: Date.now() + Math.random(), note: customNote }])
  }

  // ฟังก์ชั่นจัดการตัวเลือกเสริม (Checkbox logic)
  const toggleNoodleOption = (opt) => {
    if (noodleOptions.includes(opt)) {
      setNoodleOptions(noodleOptions.filter(o => o !== opt));
    } else {
      setNoodleOptions([...noodleOptions, opt]);
    }
  }

  const adjustQty = (amount) => {
    const newQty = noodleQty + amount;
    if (newQty >= 1) setNoodleQty(newQty);
  }

  const confirmNoodleOrder = () => {
    if (!selectedNoodleDish) return;
    
    // คำนวณราคา (บวกเพิ่มถ้าพิเศษ)
    const basePrice = selectedNoodleDish.price;
    const extraPrice = noodleSize === 'พิเศษ' ? 10 : 0;
    const finalPrice = basePrice + extraPrice;

    // สร้างชื่อเมนูยาวๆ
    const optionString = noodleOptions.length > 0 ? ` [${noodleOptions.join(', ')}]` : '';
    const fullName = `${selectedNoodleDish.name} (${noodleType} ${soupType}) - ${noodleSize}${optionString}`;

    // วนลูปตามจำนวน (Qty) เพื่อเพิ่มเข้าตะกร้าทีละชาม
    for (let i = 0; i < noodleQty; i++) {
      addToCart({ 
        ...selectedNoodleDish, 
        name: fullName, 
        price: finalPrice 
      });
    }

    setShowNoodleModal(false); 
    setSelectedNoodleDish(null);
  }

  const removeFromCart = (uid) => setCart(cart.filter(i => i.uniqueId !== uid))
  const updateNote = (uid, text) => setCart(cart.map(i => i.uniqueId === uid ? { ...i, note: text } : i))

  const handleConfirmOrder = async () => {
    if (cart.length === 0) return;
    setIsOrdering(true);
    try {
      await addDoc(collection(db, "orders"), {
        table_no: tableNo, items: cart, total_price: cart.reduce((s, i) => s + i.price, 0), status: "kitchen", timestamp: serverTimestamp()
      });
      setCart([]); setShowCartDetails(false); alert("✅ ส่งออเดอร์เรียบร้อย!");
    } catch (e) { alert("❌ ผิดพลาด: " + e.message); } finally { setIsOrdering(false); }
  }

  const handleCancelOrder = async (oid) => {
    if (confirm("ยืนยันยกเลิกออเดอร์นี้?")) { try { await deleteDoc(doc(db, "orders", oid)); } catch (e) { alert("ลบไม่ได้: " + e.message); } }
  }

  const filteredItems = menuItems.filter(i => {
    const matchCat = selectedCategory === 'ทั้งหมด' || i.category === selectedCategory;
    const isAct = activeCategories.includes(i.category);
    return matchCat && i.available !== false && isAct;
  });
  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-top">
          <div className="logo-group">
             <img src="https://chonburiartmediagroup.com/wp-content/uploads/2021/02/LOGO26-960x673.jpg" alt="Logo" className="logo-img" />
             <h1 className="app-title">ร้านอร่อยสั่งได้</h1>
          </div>
          <span className="table-badge">โต๊ะ {tableNo}</span>
        </div>
        <div className="category-scroll" ref={scrollRef} onMouseDown={handleMouseDown} onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => { if(!isDragging) setSelectedCategory(cat); }} className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}>{cat}</button>
          ))}
        </div>
      </header>

      {/* MENU GRID */}
      <div className="content-area">
        {menuItems.length === 0 ? <div className="loading-text"><p>⏳ กำลังโหลดเมนู...</p></div> : (
          <div className="menu-grid">
            {filteredItems.map((item) => (
              <div key={item.id} className="menu-card">
                <img src={item.img || 'https://via.placeholder.com/150'} className="menu-img" alt={item.name} />
                <div className="menu-content">
                  <div className="menu-name">{item.name}</div>
                  <div className="menu-category">{item.category}</div>
                  <div className="menu-footer">
                    <span className="price-tag">{item.price}.-</span>
                    <button onClick={() => handleItemClick(item)} className="add-btn">+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HISTORY */}
      {myOrders.length > 0 && (
        <div className="history-container">
            <h3 className="section-title">📋 รายการที่สั่งไป</h3>
            {myOrders.map((order) => (
              <div key={order.id} className={`history-card ${order.status === 'served' ? 'served' : 'kitchen'}`}>
                <div className="history-header">
                  <span>{order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}</span>
                  <span className={order.status === 'served' ? 'status-served' : 'status-kitchen'}>{order.status === 'served' ? '✅ เสิร์ฟแล้ว' : '👨‍🍳 กำลังทำ'}</span>
                </div>
                {order.items.map((item, idx) => (
                  <div key={idx} className="history-item-name">- {item.name}{item.note && <span className="history-item-note"> ({item.note})</span>}</div>
                ))}
                {order.status === 'kitchen' && (<button onClick={() => handleCancelOrder(order.id)} className="cancel-btn">ยกเลิก</button>)}
              </div>
            ))}
        </div>
      )}

      {/* CART BAR */}
      {cart.length > 0 && (
        <>
          <div className="cart-bar">
            <div onClick={() => setShowCartDetails(!showCartDetails)} className="cart-info">
              <div className="cart-count">{cart.length} รายการ</div>
              <div className="cart-subtext">ดูรายละเอียด 🔼</div>
            </div>
            <button onClick={handleConfirmOrder} disabled={isOrdering} className="order-btn">{isOrdering ? 'ส่ง...' : `สั่งเลย ${cartTotal} ฿`}</button>
          </div>
          
          {showCartDetails && (
            <div className="cart-modal-overlay" onClick={() => setShowCartDetails(false)}>
              <div className="cart-modal-content" onClick={e => e.stopPropagation()}>
                <h3 className="cart-modal-title">🛒 ตะกร้าสินค้า</h3>
                {cart.map((item) => (
                  <div key={item.uniqueId} className="cart-item">
                    <div className="cart-item-header">
                      <span className="cart-item-name">{item.name}</span>
                      <div className="cart-item-actions">
                        <span className="cart-item-price">{item.price}.-</span>
                        <button onClick={() => removeFromCart(item.uniqueId)} className="remove-btn">ลบ</button>
                      </div>
                    </div>
                    <input type="text" placeholder="📝 ระบุรายละเอียดเพิ่มเติม" value={item.note} onChange={(e) => updateNote(item.uniqueId, e.target.value)} className="note-input" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* NOODLE MODAL (ปรับปรุงใหม่) */}
      {showNoodleModal && (
        <div className="cart-modal-overlay" onClick={() => setShowNoodleModal(false)}>
          <div className="cart-modal-content noodle-modal" onClick={e => e.stopPropagation()}>
            <h3 className="noodle-title">🍜 ปรุงก๋วยเตี๋ยวชามโปรด</h3>
            
            {/* 1. เลือกเส้น */}
            <div className="noodle-section">
              <h4 className="noodle-label">เลือกเส้น</h4>
              <div className="noodle-options">
                {NOODLE_LIST.map(opt => (
                  <button key={opt} onClick={() => setNoodleType(opt)} className={`option-btn ${noodleType === opt ? 'selected' : ''}`}>{opt}</button>
                ))}
              </div>
            </div>

            {/* 2. เลือกน้ำซุป */}
            <div className="noodle-section">
              <h4 className="noodle-label">เลือกน้ำซุป</h4>
              <div className="noodle-options">
                {SOUP_LIST.map(opt => (
                  <button key={opt} onClick={() => setSoupType(opt)} className={`option-btn ${soupType === opt ? 'selected' : ''}`}>{opt}</button>
                ))}
              </div>
            </div>

            {/* 3. ขนาด (Size) */}
            <div className="noodle-section">
              <h4 className="noodle-label">ขนาด</h4>
              <div className="size-selector">
                <button onClick={() => setNoodleSize('ธรรมดา')} className={`size-btn ${noodleSize === 'ธรรมดา' ? 'active' : ''}`}>
                  ธรรมดา
                </button>
                <button onClick={() => setNoodleSize('พิเศษ')} className={`size-btn ${noodleSize === 'พิเศษ' ? 'active' : ''}`}>
                  พิเศษ (+10.-)
                </button>
              </div>
            </div>

            {/* 4. เพิ่มเติม (Checkbox) */}
            <div className="noodle-section">
              <h4 className="noodle-label">เพิ่มเติม</h4>
              <div className="noodle-options-grid">
                {EXTRA_LIST.map(opt => (
                  <button key={opt} onClick={() => toggleNoodleOption(opt)} className={`checkbox-btn ${noodleOptions.includes(opt) ? 'checked' : ''}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. จำนวน + ปุ่มยืนยัน */}
            <div className="noodle-footer-action">
              <div className="qty-control">
                <button onClick={() => adjustQty(-1)} className="qty-btn">-</button>
                <span className="qty-display">{noodleQty}</span>
                <button onClick={() => adjustQty(1)} className="qty-btn">+</button>
              </div>
              
              <button onClick={confirmNoodleOrder} className="order-btn confirm-noodle-btn">
                ใส่ตะกร้า {((selectedNoodleDish?.price + (noodleSize === 'พิเศษ' ? 10 : 0)) * noodleQty)} ฿
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
export default App