/**
 * Qibla Finder Pro - Core Logic
 * الإصدار المحسن والمصحح بالكامل لعام 2026
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
        
        // طلب إذن الحساسات (خاصة للأجهزة الحديثة و iOS)
        await setupOrientation();
        
        // جلب البيانات الإضافية
        fetchLocationName(state.userLat, state.userLng);
        updatePrayerTimes(state.userLat, state.userLng);

        // إخفاء الشاشات الافتتاحية
        document.getElementById('onboarding').classList.add('hidden');
        loader.classList.add('hidden');
        
        // بدء حلقة التحديث
        renderLoop();

    } catch (err) {
        console.error("Initialization Error:", err);
        alert("فشل في تهيئة التطبيق: يرجى التأكد من تفعيل الموقع GPS والموافقة على الأذونات من إعدادات المتصفح.");
        loader.classList.add('hidden');
    }
}

/**
 * 2. التحكم في وضع النهار والليل (Theme Toggle)
 */
const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const body = document.body;
        const icon = themeBtn.querySelector('i');
        
        if (body.classList.contains('dark-mode')) {
            body.classList.replace('dark-mode', 'light-mode');
            icon.classList.replace('fa-moon', 'fa-sun');
        } else {
            body.classList.replace('light-mode', 'dark-mode');
            icon.classList.replace('fa-sun', 'fa-moon');
        }
    });
}

/**
 * 3. مشاركة الموقع والقبلة
 */
const shareBtn = document.getElementById('share-location');
if (shareBtn) {
    shareBtn.addEventListener('click', () => {
        const shareText = `أنا استخدم محدد القبلة الاحترافي. اتجاه القبلة من موقعي الحالي هو ${state.qiblaAngle}° والمسافة للكعبة الشريفة ${document.getElementById('distance').textContent}.`;
        
        if (navigator.share) {
            navigator.share({
                title: 'محدد القبلة - Qibla Finder',
                text: shareText,
                url: window.location.href
            }).catch(console.error);
        } else {
            // نسخ النص في حال عدم دعم المتصفح للمشاركة الأصلية
            navigator.clipboard.writeText(shareText);
            alert("تم نسخ معلومات القبلة، يمكنك الآن مشاركتها يدوياً.");
        }
    });
}

/**
 * 4. التعامل مع حساسات التوجيه
 */
async function setupOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', onDeviceMove, true);
            }
        } catch (e) {
            console.error("Sensor Permission Error:", e);
        }
    } else {
        window.addEventListener('deviceorientation', onDeviceMove, true);
    }
}

function onDeviceMove(event) {
    // webkitCompassHeading للأيفون أو alpha للأندرويد
    state.heading = event.webkitCompassHeading || (360 - event.alpha);
    
    if (state.heading === undefined || isNaN(state.heading)) return;

    // تدوير قرص البوصلة
    const dial = document.getElementById('dial');
    if (dial) dial.style.transform = `rotate(${-state.heading}deg)`;

    // تدوير إبرة القبلة
    const needle = document.getElementById('qibla-needle');
    const needleRotation = state.qiblaAngle - state.heading;
    if (needle) needle.style.transform = `rotate(${needleRotation}deg)`;

    checkFacing(needleRotation);
}

/**
 * 5. الحسابات الرياضية
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

    return { 
        angle: bearing.toFixed(0), 
        distance: (R * c).toFixed(0) 
    };
}

/**
 * 6. فحص المواجهة
 */
function checkFacing(relativeAngle) {
    const normalized = Math.abs(((relativeAngle + 180) % 360) - 180);
    const isNowFacing = normalized < 10; // دقة 10 درجات

    const visualizer = document.getElementById('visualizer');
    if (isNowFacing) {
        if (!state.isFacing) {
            state.isFacing = true;
            visualizer.classList.add('facing-qibla');
            if (navigator.vibrate) navigator.vibrate(50);
        }
    } else {
        if (state.isFacing) {
            state.isFacing = false;
            visualizer.classList.remove('facing-qibla');
        }
    }
}

/**
 * 7. خدمات المواقيت والموقع
 */
async function fetchLocationName(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        document.getElementById('location').textContent = data.address.city || data.address.state || "موقعك الحالي";
    } catch {
        document.getElementById('location').textContent = "تم تحديد الموقع";
    }
}

function updatePrayerTimes(lat, lng) {
    if (typeof adhan === 'undefined') return;

    const coords = new adhan.Coordinates(lat, lng);
    const date = new Date();
    const params = adhan.CalculationMethod.Egyptian();
    const prayerTimes = new adhan.PrayerTimes(coords, date, params);
    
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
}

/**
 * 8. الكاميرا (AR Mode)
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
            } catch (err) {
                alert("لا يمكن فتح الكاميرا: " + err.message);
            }
        } else {
            video.classList.add('hidden');
            const stream = video.srcObject;
            if (stream) stream.getTracks().forEach(track => track.stop());
            document.body.classList.remove('ar-active');
        }
    });
}

function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
            enableHighAccuracy: true,
            timeout: 10000
        });
    });
}

function renderLoop() {
    requestAnimationFrame(renderLoop);
}