/* ===== COMPASS RESIZE FALLBACK =====
   أضف هذا الجزء في أسفل script.js أو داخل startApp بعد تحميل الـ DOM */
(function ensureSquareCompass() {
  const resizeCompass = () => {
    const c = document.querySelector('.compass-container');
    if (!c) return;
    // استخدم aspect-ratio إذا مدعوم — لكن في الفالّباك نضبط اليدوياً
    if (!CSS.supports || !CSS.supports('aspect-ratio', '1 / 1')) {
      const w = c.clientWidth;
      c.style.height = `${w}px`;
    } else {
      // تأكد أننا لا نترك قيمة height ثابتة لو قبلاً عيّنّاها
      c.style.height = '';
    }
  };

  window.addEventListener('resize', resizeCompass, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resizeCompass, 150));
  // نطلقها بعد تحميل الصفحة
  document.addEventListener('DOMContentLoaded', resizeCompass);
  // وننادى مرة إضافية لو تم استدعاء startApp لاحقاً
  setTimeout(resizeCompass, 300);
})();
/**
 * Qibla Finder Pro - Core Logic
 * الإصدار الاحترافي الكامل 2026 - محسّن للموبايل
 */

// الإعدادات الثابتة (إحداثيات الكعبة المشرفة - دقيقة)
const KAABA = { lat: 21.422487, lng: 39.826206 };

// حالة التطبيق الحالية
let state = {
    userLat: null,
    userLng: null,
    accuracy: null,
    qiblaAngle: 0,
    heading: 0,
    isFacing: false,
    isCalibrating: false,
    compassOffset: 0 // تعويض معايرة البوصلة
};

// للأداء - تقليل التحديثات المتكررة
let lastUpdate = 0;
const UPDATE_INTERVAL = 50; // 20 FPS

/**
 * 1. نقطة الانطلاق الرئيسية
 */
async function startApp() {
    const loader = document.getElementById('loading-spinner');
    const onboarding = document.getElementById('onboarding');
    
    if (loader) loader.classList.remove('hidden');
    if (onboarding) onboarding.classList.add('hidden');

    try {
        // توليد الشرطات والدرجات حول البوصلة
        generateCompassTicks();

        // طلب إذن الموقع الجغرافي
        const pos = await getCurrentLocation();
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        state.accuracy = pos.coords.accuracy;

        console.log('Location obtained:', state.userLat, state.userLng, 'Accuracy:', state.accuracy);

        // حساب زاوية القبلة والمسافة - بدقة عالية
        const qiblaData = calculateQibla(state.userLat, state.userLng);
        state.qiblaAngle = qiblaData.angle;
        
        console.log('Qibla calculated:', state.qiblaAngle, 'degrees');
        
        // تحديث الواجهة
        updateUI(qiblaData);
        
        // طلب إذن الحساسات
        await setupOrientation();
        
        // تحميل اسم الموقع ومواقيت الصلاة
        fetchLocationName(state.userLat, state.userLng);
        updatePrayerTimes(state.userLat, state.userLng);
        updateHijriDate();

        if (loader) loader.classList.add('hidden');
        
        // بدء حلقة التحديث
        renderLoop();

    } catch (err) {
        console.error("Initialization Error:", err);
        showError(err.message);
        if (loader) loader.classList.add('hidden');
    }
}

/**
 * عرض رسائل الخطأ
 */
function showError(message) {
    const errorDiv = document.getElementById('permission-error');
    const errorMessage = document.getElementById('error-message');
    
    if (errorDiv && errorMessage) {
        errorMessage.textContent = message || 'حدث خطأ. يرجى التأكد من تفعيل GPS والسماح بالوصول للموقع والبوصلة.';
        errorDiv.classList.remove('hidden');
    } else {
        alert(message || 'فشل في تهيئة التطبيق');
    }
}

/**
 * إعادة طلب الأذونات
 */
async function requestPermissions() {
    const errorDiv = document.getElementById('permission-error');
    if (errorDiv) errorDiv.classList.add('hidden');
    await startApp();
}

/**
 * تحديث واجهة المستخدم
 */
function updateUI(qiblaData) {
    const angleEl = document.getElementById('angle');
    const distanceEl = document.getElementById('distance');
    const accuracyEl = document.getElementById('accuracy');
    const coordsEl = document.getElementById('coords');
    
    if (angleEl) angleEl.textContent = `${qiblaData.angle}°`;
    if (distanceEl) distanceEl.textContent = `${qiblaData.distance} كم`;
    if (accuracyEl) {
        if (state.accuracy < 20) {
            accuracyEl.textContent = 'ممتازة';
        } else if (state.accuracy < 50) {
            accuracyEl.textContent = 'جيدة';
        } else {
            accuracyEl.textContent = 'متوسطة';
        }
    }
    if (coordsEl && state.userLat && state.userLng) {
        coordsEl.textContent = `${state.userLat.toFixed(4)}, ${state.userLng.toFixed(4)}`;
    }
}

/**
 * دالة توليد الدرجات والشرطات (Ticks) مثل الصورة المرجعية
 */
function generateCompassTicks() {
    const overlay = document.getElementById('ticks-overlay');
    if (!overlay) return;
    
    overlay.innerHTML = ''; // مسح المحتوى القديم
    
    // إنشاء شرطات للبوصلة
    for (let i = 0; i < 360; i++) {
        const tick = document.createElement('div');
        
        // الشرطات الطويلة كل 30 درجة
        if (i % 30 === 0) {
            tick.className = 'tick long';
        } 
        // الشرطات المتوسطة كل 15 درجة
        else if (i % 15 === 0) {
            tick.className = 'tick';
        }
        // الشرطات الصغيرة كل 5 درجات
        else if (i % 5 === 0) {
            tick.className = 'tick';
            tick.style.opacity = '0.5';
        }
        // تخطي الدرجات الأخرى
        else {
            continue;
        }
        
        tick.style.transform = `rotate(${i}deg)`;
        
        // إضافة أرقام الدرجات كل 15 درجة (ما عدا الاتجاهات الرئيسية)
        if (i % 15 === 0 && i !== 0 && i !== 90 && i !== 180 && i !== 270) {
            const num = document.createElement('span');
            num.className = 'tick-number';
            num.textContent = i;
            num.style.transform = `rotate(${-i}deg)`;
            tick.appendChild(num);
        }
        
        overlay.appendChild(tick);
    }
    
    console.log('Compass ticks generated');
}

/**
 * 2. التحكم في الحساسات وحركة البوصلة
 */
async function setupOrientation() {
    // iOS 13+ يتطلب إذن صريح
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientationabsolute', onDeviceMove, true);
                window.addEventListener('deviceorientation', onDeviceMove, true);
                console.log('Orientation permission granted (iOS)');
            } else {
                throw new Error('تم رفض الوصول للبوصلة. يرجى السماح بالوصول من إعدادات المتصفح.');
            }
        } catch (e) { 
            console.error("Orientation permission error:", e);
            throw e;
        }
    } else {
        // Android والأجهزة الأخرى
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', onDeviceMove, true);
        } else {
            window.addEventListener('deviceorientation', onDeviceMove, true);
        }
        console.log('Orientation listener added (Android/Desktop)');
    }
}

/**
 * معالج حركة الجهاز - محسّن للأداء
 */
function onDeviceMove(event) {
    const now = Date.now();
    if (now - lastUpdate < UPDATE_INTERVAL) return; // Throttle
    lastUpdate = now;
    
    // الحصول على اتجاه الشمال المغناطيسي
    let heading;
    
    if (event.webkitCompassHeading !== undefined) {
        // iOS - يعطي القيمة مباشرة
        heading = event.webkitCompassHeading;
    } else if (event.absolute && event.alpha !== null) {
        // Android - deviceorientationabsolute
        heading = 360 - event.alpha;
    } else if (event.alpha !== null) {
        // Fallback - deviceorientation عادي
        heading = 360 - event.alpha;
    } else {
        return; // لا توجد بيانات
    }
    
    // تطبيق تعويض المعايرة
    heading = (heading + state.compassOffset) % 360;
    
    state.heading = heading;
    
    if (state.heading === undefined || isNaN(state.heading)) return;

    // تدوير قرص الدرجات (Dial) - القرص الخارجي يدور عكس اتجاه الهاتف
    const dial = document.getElementById('dial');
    if (dial) {
        dial.style.transform = `rotate(${-state.heading}deg)`;
    }

    // تدوير حلقة الشرطات أيضاً
    const ticks = document.getElementById('ticks-overlay');
    if (ticks) {
        ticks.style.transform = `rotate(${-state.heading}deg)`;
    }

    // تدوير إبرة القبلة (الإبرة الحمراء تشير لاتجاه القبلة)
    const needle = document.getElementById('qibla-needle');
    const needleRotation = state.qiblaAngle - state.heading;
    if (needle) {
        needle.style.transform = `rotate(${needleRotation}deg)`;
    }

    // تحديث الرقم المركزي (الدرجة الحالية)
    const centerDeg = document.getElementById('center-degree');
    const centerDir = document.getElementById('center-direction');
    
    if (centerDeg) {
        centerDeg.textContent = `${Math.round(state.heading)}°`;
    }
    
    // تحديث اتجاه البوصلة في المركز
    if (centerDir) {
        centerDir.textContent = getCardinalDirection(state.heading);
    }

    // فحص مواجهة القبلة
    checkFacing(needleRotation);
}

/**
 * دالة مساعدة لتحديد الاتجاه الأساسي
 */
function getCardinalDirection(degrees) {
    const dirs = [
        'شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 
        'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'
    ];
    const dirsEn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((degrees % 360) / 45)) % 8;
    return dirsEn[index];
}

/**
 * 3. الحسابات الرياضية - حساب دقيق لزاوية القبلة
 * استخدام معادلة Haversine للحساب الدقيق
 */
function calculateQibla(userLat, userLng) {
    // تحويل الدرجات إلى راديان
    const lat1 = toRadians(userLat);
    const lon1 = toRadians(userLng);
    const lat2 = toRadians(KAABA.lat);
    const lon2 = toRadians(KAABA.lng);

    // حساب الفرق
    const dLon = lon2 - lon1;

    // حساب الزاوية (Bearing) باستخدام معادلة دقيقة
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - 
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x);
    
    // تحويل من راديان إلى درجات
    bearing = toDegrees(bearing);
    
    // تحويل إلى نطاق 0-360
    bearing = (bearing + 360) % 360;

    // حساب المسافة باستخدام Haversine Formula
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = lat2 - lat1;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return { 
        angle: Math.round(bearing), 
        distance: Math.round(distance).toLocaleString('ar-EG')
    };
}

/**
 * دوال مساعدة للتحويل
 */
function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

/**
 * 4. فحص مواجهة القبلة - محسّن
 */
function checkFacing(relativeAngle) {
    // تطبيع الزاوية إلى نطاق -180 إلى 180
    let normalized = relativeAngle % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    
    const absAngle = Math.abs(normalized);
    
    // دقة 8 درجات (±4 درجات من كل جانب)
    const isNowFacing = absAngle < 8;

    const visualizer = document.getElementById('visualizer');
    const statusMsg = document.getElementById('status-msg');
    const statusIcon = statusMsg ? statusMsg.querySelector('i') : null;
    const statusText = statusMsg ? statusMsg.querySelector('span') : null;
    
    if (isNowFacing) {
        if (!state.isFacing) {
            state.isFacing = true;
            if (visualizer) visualizer.classList.add('facing-qibla');
            if (statusIcon) {
                statusIcon.className = 'fas fa-check-circle';
            }
            if (statusText) {
                statusText.textContent = 'أنت تواجه القبلة الآن!';
            }
            // اهتزاز خفيف
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
        }
    } else {
        if (state.isFacing) {
            state.isFacing = false;
            if (visualizer) visualizer.classList.remove('facing-qibla');
            if (statusIcon) {
                statusIcon.className = 'fas fa-compass';
            }
            if (statusText) {
                // إعطاء توجيهات بناءً على الزاوية
                if (absAngle < 45) {
                    statusText.textContent = 'قريب جداً - اضبط قليلاً';
                } else if (absAngle < 90) {
                    statusText.textContent = 'استمر في التوجيه';
                } else {
                    statusText.textContent = 'وجه الهاتف نحو الكعبة الشريفة';
                }
            }
        }
    }
}

/**
 * 5. الخدمات والمواقيت
 */
async function fetchLocationName(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`,
            { headers: { 'User-Agent': 'QiblaFinderPro/1.0' } }
        );
        const data = await res.json();
        
        const locationName = data.address.city || 
                           data.address.town || 
                           data.address.village || 
                           data.address.county ||
                           data.address.state || 
                           "موقعك الحالي";
                           
        const locationEl = document.getElementById('location');
        if (locationEl) {
            locationEl.textContent = locationName;
        }
    } catch (err) { 
        console.error("Location fetch error:", err);
        const locationEl = document.getElementById('location');
        if (locationEl) {
            locationEl.textContent = "متصل بالـ GPS"; 
        }
    }
}

/**
 * تحديث مواقيت الصلاة
 */
function updatePrayerTimes(lat, lng) {
    if (typeof adhan === 'undefined') {
        console.warn("Adhan library not loaded");
        return;
    }
    
    try {
        const coords = new adhan.Coordinates(lat, lng);
        const params = adhan.CalculationMethod.MuslimWorldLeague();
        params.madhab = adhan.Madhab.Shafi; // أو Hanafi حسب المنطقة
        
        const date = new Date();
        const prayerTimes = new adhan.PrayerTimes(coords, date, params);
        
        const prayers = [
            { name: 'الفجر', time: prayerTimes.fajr },
            { name: 'الشروق', time: prayerTimes.sunrise },
            { name: 'الظهر', time: prayerTimes.dhuhr },
            { name: 'العصر', time: prayerTimes.asr },
            { name: 'المغرب', time: prayerTimes.maghrib },
            { name: 'العشاء', time: prayerTimes.isha }
        ];

        // تحديد الصلاة القادمة
        const now = new Date();
        let nextPrayerIndex = prayers.findIndex(p => p.time > now);
        if (nextPrayerIndex === -1) nextPrayerIndex = 0; // غداً الفجر

        const container = document.getElementById('prayer-times');
        if (container) {
            container.innerHTML = prayers.map((p, i) => `
                <div class="prayer-card ${i === nextPrayerIndex ? 'active' : ''}">
                    <small>${p.name}</small>
                    <strong>${p.time.toLocaleTimeString('ar-EG', {
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: false
                    })}</strong>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Prayer times error:", err);
    }
}

/**
 * تحديث التاريخ الهجري
 */
function updateHijriDate() {
    try {
        const today = new Date();
        const hijriDate = today.toLocaleDateString('ar-SA-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        const hijriEl = document.getElementById('hijri-date');
        if (hijriEl) {
            hijriEl.textContent = hijriDate;
        }
    } catch (err) {
        console.error("Hijri date error:", err);
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
                    video: { 
                        facingMode: "environment",
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    } 
                });
                video.srcObject = stream;
                video.classList.remove('hidden');
                document.body.classList.add('ar-active');
                arBtn.innerHTML = '<i class="fas fa-times"></i>';
                arBtn.title = 'إيقاف الكاميرا';
            } catch (err) { 
                console.error("Camera error:", err);
                alert("الكاميرا غير متاحة أو لم يتم منح الإذن"); 
            }
        } else {
            video.classList.add('hidden');
            const stream = video.srcObject;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            document.body.classList.remove('ar-active');
            arBtn.innerHTML = '<i class="fas fa-camera"></i>';
            arBtn.title = 'الواقع المعزز';
        }
    });
}

/**
 * 7. التحكم في الثيم (Theme Toggle)
 */
const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) {
    // تحميل الثيم المحفوظ
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        const icon = themeBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }
    
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const icon = themeBtn.querySelector('i');
        if (icon) {
            if (document.body.classList.contains('light-mode')) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
                localStorage.setItem('theme', 'light');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
                localStorage.setItem('theme', 'dark');
            }
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
                    text: `زاوية القبلة: ${state.qiblaAngle}°\nالمسافة للكعبة: ${document.getElementById('distance')?.textContent}\nالموقع: https://www.google.com/maps?q=${state.userLat},${state.userLng}`,
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.log("Share error:", err);
                }
            }
        } else {
            // Fallback: نسخ الموقع
            const locationText = `الموقع: ${state.userLat?.toFixed(6)}, ${state.userLng?.toFixed(6)}\nزاوية القبلة: ${state.qiblaAngle}°`;
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(locationText);
                showToast('تم نسخ المعلومات!');
            } else {
                alert(locationText);
            }
        }
    });
}

/**
 * 9. زر إعادة التحميل
 */
const reloadBtn = document.getElementById('reload-location');
if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
        location.reload();
    });
}

/**
 * 10. معايرة البوصلة
 */
const calibrateBtn = document.getElementById('calibrate-btn');
const calibrationModal = document.getElementById('calibration-modal');

if (calibrateBtn) {
    calibrateBtn.addEventListener('click', () => {
        if (calibrationModal) {
            calibrationModal.classList.remove('hidden');
        }
    });
}

function closeCalibrationModal() {
    if (calibrationModal) {
        calibrationModal.classList.add('hidden');
    }
}

/**
 * إظهار رسائل مؤقتة
 */
function showToast(message) {
    // يمكن تحسينها لاحقاً بـ toast notification مخصص
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
        const originalText = statusMsg.innerHTML;
        statusMsg.innerHTML = `<i class="fas fa-check"></i><span>${message}</span>`;
        setTimeout(() => {
            statusMsg.innerHTML = originalText;
        }, 2000);
    }
}

/**
 * 11. الدوال المساعدة
 */
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("المتصفح لا يدعم تحديد الموقع الجغرافي"));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            resolve, 
            (error) => {
                let message = "فشل في الحصول على الموقع. ";
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        message += "يرجى السماح بالوصول للموقع من إعدادات المتصفح.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message += "الموقع غير متاح حالياً.";
                        break;
                    case error.TIMEOUT:
                        message += "انتهت مهلة الطلب.";
                        break;
                    default:
                        message += "خطأ غير معروف.";
                }
                reject(new Error(message));
            }, 
            { 
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    });
}

/**
 * حلقة التحديث - لإبقاء التطبيق نشطاً
 */
function renderLoop() {
    requestAnimationFrame(renderLoop);
}

/**
 * منع Sleep على الموبايل
 */
let wakeLock = null;
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock activated');
        } catch (err) {
            console.error('Wake Lock error:', err);
        }
    }
}

// إعادة تفعيل Wake Lock عند العودة للتطبيق
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

/**
 * تهيئة عند تحميل الصفحة
 */
window.addEventListener('load', () => {
    console.log("Qibla Finder Pro 2026 - Loaded");
    requestWakeLock();
});

/**
 * التعامل مع تغيير اتجاه الشاشة
 */
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        // إعادة حساب في حالة تغيير الاتجاه
        if (state.userLat && state.userLng) {
            const qiblaData = calculateQibla(state.userLat, state.userLng);
            state.qiblaAngle = qiblaData.angle;
            updateUI(qiblaData);
        }
    }, 100);
});

/**
 * منع Zoom غير المرغوب على الموبايل
 */
document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);
