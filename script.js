/**
 * Qibla Finder Pro - Core Logic
 * الإصدار الاحترافي الكامل 2026
 */

// الإعدادات الثابتة (إحداثيات الكعبة المشرفة)
const KAABA = { lat: 21.4225, lng: 39.8262 };

// حالة التطبيق الحالية
let state = {
    userLat: null,
    userLng: null,
    qiblaAngle: 0,
    heading: 0,
    isFacing: false
};

/**
 * 1. نقطة الانطلاق الرئيسية
 */
async function startApp() {
    const loader = document.getElementById('loading-spinner');
    loader.classList.remove('hidden');

    try {
        // توليد الشرطات والدرجات حول البوصلة (التصميم الجديد)
        generateCompassTicks();

        // طلب إذن الموقع الجغرافي
        const pos = await getCurrentLocation();
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;

        // حساب زاوية القبلة والمسافة
        const qiblaData = calculateQibla(state.userLat, state.userLng);
        state.qiblaAngle = qiblaData.angle;
        
        // تحديث الواجهة
        document.getElementById('angle').textContent = `${qiblaData.angle}°`;
        document.getElementById('distance').textContent = `${qiblaData.distance} كم`;
        
        // طلب إذن الحساسات
        await setupOrientation();
        
        fetchLocationName(state.userLat, state.userLng);
        updatePrayerTimes(state.userLat, state.userLng);

        document.getElementById('onboarding').classList.add('hidden');
        loader.classList.add('hidden');
        
        renderLoop();

    } catch (err) {
        console.error("Initialization Error:", err);
        alert("فشل في تهيئة التطبيق: يرجى تفعيل GPS والموافقة على الأذونات.");
        loader.classList.add('hidden');
    }
}

/**
 * دالة توليد الدرجات والشرطات (Ticks) مثل الصورة المرجعية
 */
function generateCompassTicks() {
    const overlay = document.getElementById('ticks-overlay');
    if (!overlay) return;
    
    overlay.innerHTML = ''; // مسح المحتوى القديم
    
    // إنشاء 360 شرطة (كل درجة)
    for (let i = 0; i < 360; i++) {
        const tick = document.createElement('div');
        
        // الشرطات الطويلة كل 15 درجة
        if (i % 15 === 0) {
            tick.className = 'tick long';
        } 
        // الشرطات العادية كل 5 درجات
        else if (i % 5 === 0) {
            tick.className = 'tick';
        }
        // تخطي الدرجات الأخرى لجعل التصميم أنظف
        else {
            continue;
        }
        
        tick.style.transform = `rotate(${i}deg)`;
        
        // إضافة أرقام الدرجات كل 15 درجة (مثل الصورة: 15, 30, 45, 60...)
        if (i % 15 === 0 && i !== 0 && i !== 90 && i !== 180 && i !== 270) {
            const num = document.createElement('span');
            num.className = 'tick-number';
            num.textContent = i;
            num.style.transform = `rotate(${-i}deg)`;
            tick.appendChild(num);
        }
        
        overlay.appendChild(tick);
    }
}

/**
 * 2. التحكم في الحساسات وحركة البوصلة
 */
async function setupOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', onDeviceMove, true);
            }
        } catch (e) { 
            console.error("Orientation permission error:", e); 
        }
    } else {
        window.addEventListener('deviceorientation', onDeviceMove, true);
    }
}

function onDeviceMove(event) {
    // جلب اتجاه الشمال المغناطيسي
    state.heading = event.webkitCompassHeading || (360 - event.alpha);
    
    if (state.heading === undefined || isNaN(state.heading)) return;

    // تدوير قرص الدرجات (Dial) - القرص الخارجي يدور
    const dial = document.getElementById('dial');
    if (dial) dial.style.transform = `rotate(${-state.heading}deg)`;

    // تدوير حلقة الشرطات أيضاً
    const ticks = document.getElementById('ticks-overlay');
    if (ticks) ticks.style.transform = `rotate(${-state.heading}deg)`;

    // تدوير إبرة القبلة (الإبرة الحمراء)
    const needle = document.getElementById('qibla-needle');
    const needleRotation = state.qiblaAngle - state.heading;
    if (needle) needle.style.transform = `rotate(${needleRotation}deg)`;

    // تحديث الرقم المركزي (الدرجة الحالية)
    const centerDeg = document.getElementById('center-degree');
    const centerDir = document.getElementById('center-direction');
    
    if (centerDeg) centerDeg.textContent = `${Math.round(state.heading)}°`;
    
    // تحديث اتجاه البوصلة في المركز
    if (centerDir) {
        centerDir.textContent = getCardinalDirection(state.heading);
    }

    checkFacing(needleRotation);
}

/**
 * دالة مساعدة لتحديد الاتجاه الأساسي
 */
function getCardinalDirection(degrees) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((degrees % 360) / 45)) % 8;
    return dirs[index];
}

/**
 * 3. الحسابات الرياضية
 */
function calculateQibla(lat, lng) {
    const φ1 = lat * Math.PI / 180;
    const φ2 = KAABA.lat * Math.PI / 180;
    const Δλ = (KAABA.lng - lng) * Math.PI / 180;

    const y = Math.sin(Δλ);
    const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;

    const R = 6371; 
    const dLat = (KAABA.lat - lat) * Math.PI / 180;
    const dLng = (KAABA.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dLng/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return { angle: bearing.toFixed(0), distance: (R * c).toFixed(0) };
}

/**
 * 4. فحص مواجهة الكعبة
 */
function checkFacing(relativeAngle) {
    const normalized = Math.abs(((relativeAngle + 180) % 360) - 180);
    const isNowFacing = normalized < 10; // دقة 10 درجات

    const visualizer = document.getElementById('visualizer');
    const statusMsg = document.getElementById('status-msg');
    
    if (isNowFacing) {
        if (!state.isFacing) {
            state.isFacing = true;
            visualizer.classList.add('facing-qibla');
            if (statusMsg) statusMsg.textContent = '✅ أنت تواجه القبلة الآن!';
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }
    } else {
        if (state.isFacing) {
            state.isFacing = false;
            visualizer.classList.remove('facing-qibla');
            if (statusMsg) statusMsg.textContent = 'وجه الهاتف نحو الكعبة الشريفة';
        }
    }
}

/**
 * 5. الخدمات والمواقيت
 */
async function fetchLocationName(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`);
        const data = await res.json();
        const locationName = data.address.city || data.address.town || data.address.village || data.address.state || "موقعك الحالي";
        document.getElementById('location').textContent = locationName;
    } catch (err) { 
        console.error("Location fetch error:", err);
        document.getElementById('location').textContent = "متصل بالـ GPS"; 
    }
}

function updatePrayerTimes(lat, lng) {
    if (typeof adhan === 'undefined') {
        console.warn("Adhan library not loaded");
        return;
    }
    
    try {
        const coords = new adhan.Coordinates(lat, lng);
        const params = adhan.CalculationMethod.Egyptian();
        const prayerTimes = new adhan.PrayerTimes(coords, new Date(), params);
        
        const prayers = [
            { n: 'الفجر', t: prayerTimes.fajr },
            { n: 'الظهر', t: prayerTimes.dhuhr },
            { n: 'العصر', t: prayerTimes.asr },
            { n: 'المغرب', t: prayerTimes.maghrib },
            { n: 'العشاء', t: prayerTimes.isha }
        ];

        document.getElementById('prayer-times').innerHTML = prayers.map(p => `
            <div class="prayer-card">
                <small>${p.n}</small>
                <strong>${p.t.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</strong>
            </div>
        `).join('');
    } catch (err) {
        console.error("Prayer times error:", err);
    }
}

/**
 * 6. التحكم في الكاميرا (AR Mode)
 */
const arBtn = document.getElementById('ar-toggle');
if (arBtn) {
    arBtn.addEventListener('click', async () => {
        const video = document.getElementById('video-bg');
        if (video.classList.contains('hidden')) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: "environment" } 
                });
                video.srcObject = stream;
                video.classList.remove('hidden');
                document.body.classList.add('ar-active');
                arBtn.innerHTML = '<i class="fas fa-times"></i>';
            } catch (err) { 
                console.error("Camera error:", err);
                alert("الكاميرا غير متاحة أو لم يتم منح الإذن"); 
            }
        } else {
            video.classList.add('hidden');
            const stream = video.srcObject;
            if (stream) stream.getTracks().forEach(track => track.stop());
            document.body.classList.remove('ar-active');
            arBtn.innerHTML = '<i class="fas fa-camera"></i>';
        }
    });
}

/**
 * 7. التحكم في الثيم (Theme Toggle)
 */
const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const icon = themeBtn.querySelector('i');
        if (document.body.classList.contains('light-mode')) {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        } else {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    });
}

/**
 * 8. زر المشاركة
 */
const shareBtn = document.getElementById('share-location');
if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
        if (navigator.share && state.userLat && state.userLng) {
            try {
                await navigator.share({
                    title: 'موقعي واتجاه القبلة',
                    text: `زاوية القبلة: ${state.qiblaAngle}°\nالمسافة للكعبة: ${document.getElementById('distance').textContent}`,
                    url: `https://www.google.com/maps?q=${state.userLat},${state.userLng}`
                });
            } catch (err) {
                console.log("Share cancelled or failed:", err);
            }
        } else {
            // Fallback: نسخ الموقع
            const locationText = `Lat: ${state.userLat?.toFixed(6)}, Lng: ${state.userLng?.toFixed(6)}`;
            navigator.clipboard?.writeText(locationText);
            alert('تم نسخ الموقع!');
        }
    });
}

/**
 * 9. الدوال المساعدة
 */
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported"));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            resolve, 
            reject, 
            { 
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

function renderLoop() {
    // هذه الدالة تبقي التطبيق نشطاً
    requestAnimationFrame(renderLoop);
}

// تهيئة عند تحميل الصفحة
window.addEventListener('load', () => {
    console.log("Qibla Finder Pro loaded successfully");
});
