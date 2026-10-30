const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;
const SCREENSHOT_DIR = path.resolve(
  'C:\\Users\\Chocochips Warehouse\\.gemini\\antigravity\\brain\\332a2c49-4f24-41ca-8ccd-a913c7c0e33b\\ui_audit_screenshots'
);

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const PAGES_TO_AUDIT = [
  { name: 'Dashboard', path: '/' },
  { name: 'Produksi', path: '/produksi' },
  { name: 'Inventory_Dashboard', path: '/inventory' },
  { name: 'LoadingDock', path: '/loading-dock' },
  { name: 'PesananSaya', path: '/pesanan-saya' },
  { name: 'PusatResolusi', path: '/pusat-resolusi' },
  { name: 'RekapTagihanJNE', path: '/rekap-tagihan-jne' },
  { name: 'ScannerLog', path: '/scanner' },
  { name: 'KatalogProduk', path: '/katalog-produk' },
  { name: 'LaporanQC', path: '/quality-control' },
  { name: 'TugasPicking', path: '/tugas-picking' },
  { name: 'Peminjaman', path: '/peminjaman' },
  { name: 'CetakLabel', path: '/cetak-label' },
  { name: 'CetakBarcode', path: '/cetak-barcode' },
  { name: 'HR_Karyawan', path: '/karyawan' },
  { name: 'HR_Presensi', path: '/presensi' },
  { name: 'HR_RosterShift', path: '/roster-shift' },
  { name: 'HR_Rekap', path: '/hr-rekap' },
];

function waitForServer(port, timeout = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http
        .get(`http://localhost:${port}`, (res) => {
          if (res.statusCode < 500) {
            resolve(true);
          } else {
            setTimeout(check, 500);
          }
        })
        .on('error', () => {
          if (Date.now() - startTime > timeout) {
            reject(new Error(`Timeout waiting for preview server on port ${port}`));
          } else {
            setTimeout(check, 500);
          }
        });
    }
    check();
  });
}

async function runAuditor() {
  console.log('🚀 [UI AUDITOR] Memulai Preview Server pada port', PREVIEW_PORT);
  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });

  try {
    await waitForServer(PREVIEW_PORT);
    console.log('✅ [UI AUDITOR] Preview Server siap di', BASE_URL);

    console.log('🌐 [UI AUDITOR] Menjalankan Chrome Headless:', CHROME_PATH);
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();

    // 1. Inisialisasi Auth Session Superadmin di localStorage
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('wms_session_token', 'audit_token_superadmin_123');
      localStorage.setItem('wms_session_username', 'warehouse');
      localStorage.setItem('wms_session_name', 'Super Admin Auditor');
      localStorage.setItem('wms_user_role', 'superadmin');
      localStorage.setItem('wms_session_expiry', String(Date.now() + 8640000000));
    });
    console.log('🔑 [UI AUDITOR] Session Superadmin terpasang');

    const auditResults = [];

    for (const item of PAGES_TO_AUDIT) {
      console.log(`\n🔎 [AUDIT] Menguji Halaman: ${item.name} (${item.path})`);
      const targetUrl = `${BASE_URL}${item.path}`;

      // --- A. DESKTOP 1440x900 (Standar Laptop/Monitor) ---
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));

      const desktopFile = `${item.name}_desktop_1440.png`;
      const desktopPath = path.join(SCREENSHOT_DIR, desktopFile);
      await page.screenshot({ path: desktopPath, fullPage: false });

      // Cek Metrik DOM Desktop
      const desktopMetrics = await page.evaluate(() => {
        const bodyScrollWidth = document.documentElement.scrollWidth;
        const windowWidth = window.innerWidth;
        const hasHorizontalScroll = bodyScrollWidth > windowWidth + 5;

        // Analisis Button Solid Warna-Warni (Rainbow Buttons)
        const buttons = Array.from(document.querySelectorAll('button'));
        const solidButtons = buttons
          .filter((b) => {
            const cls = b.className || '';
            return (
              (cls.includes('bg-orange-') ||
                cls.includes('bg-blue-600') ||
                cls.includes('bg-emerald-600') ||
                cls.includes('bg-amber-500') ||
                cls.includes('bg-rose-600') ||
                cls.includes('bg-indigo-600')) &&
              cls.includes('text-white')
            );
          })
          .map((b) => b.innerText.trim().slice(0, 30));

        // Analisis Teks Terpotong Ellipsis
        const truncatedElements = Array.from(document.querySelectorAll('.truncate'))
          .filter((el) => el.scrollWidth > el.clientWidth)
          .map((el) => (el.textContent || '').trim().slice(0, 40));

        // Analisis Tabel
        const tables = Array.from(document.querySelectorAll('table'));
        const hasTableFixed = tables.some((t) => (t.className || '').includes('table-fixed'));

        return {
          hasHorizontalScroll,
          solidButtonsCount: solidButtons.length,
          solidButtonsSamples: solidButtons.slice(0, 6),
          truncatedSamples: truncatedElements.slice(0, 5),
          hasTable: tables.length > 0,
          hasTableFixed,
        };
      });

      // --- B. DESKTOP WIDESCREEN 1920x1080 (Zoom Out / Monitor Lebar) ---
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await new Promise((r) => setTimeout(r, 600));
      const wideFile = `${item.name}_wide_1920.png`;
      const widePath = path.join(SCREENSHOT_DIR, wideFile);
      await page.screenshot({ path: widePath, fullPage: false });

      // Cek Container Max-Width Clamping
      const wideContainerMetrics = await page.evaluate(() => {
        const main = document.querySelector('main, .flex-1');
        const container = document.querySelector('.max-w-\\[1600px\\], .max-w-7xl, .max-w-6xl, .max-w-4xl');
        return {
          hasMaxWClamp: !!container,
          containerClass: container ? container.className : 'unclamped-fluid',
        };
      });

      // --- C. MOBILE 390x844 (HP Seluler / Portrait) ---
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await new Promise((r) => setTimeout(r, 800));
      const mobileFile = `${item.name}_mobile_390.png`;
      const mobilePath = path.join(SCREENSHOT_DIR, mobileFile);
      await page.screenshot({ path: mobilePath, fullPage: false });

      // Cek Metrik DOM Mobile
      const mobileMetrics = await page.evaluate(() => {
        const bodyScrollWidth = document.documentElement.scrollWidth;
        const windowWidth = window.innerWidth;
        const hasHorizontalScroll = bodyScrollWidth > windowWidth + 2;

        // Cek apakah tab navigasi menumpuk vertikal (flex-wrap) atau horizontal swipe
        const tabBars = Array.from(document.querySelectorAll('.flex-wrap, .overflow-x-auto'));
        const hasStackedTabs = tabBars.some(
          (b) => (b.className || '').includes('flex-wrap') && b.querySelectorAll('button').length > 2
        );

        // Cek Safe Area Padding Bawah untuk FAB
        const pageWrapper = document.querySelector('.flex-1, main');
        const hasBottomPadding = pageWrapper
          ? (pageWrapper.className || '').includes('pb-20') || (pageWrapper.className || '').includes('pb-24')
          : false;

        return {
          hasHorizontalScroll,
          hasStackedTabs,
          hasBottomPadding,
        };
      });

      const pageReport = {
        name: item.name,
        path: item.path,
        desktopScreenshot: desktopFile,
        wideScreenshot: wideFile,
        mobileScreenshot: mobileFile,
        desktopMetrics,
        wideContainerMetrics,
        mobileMetrics,
      };

      auditResults.push(pageReport);
      console.log(`  📸 Screenshot tersimpan: ${desktopFile}, ${wideFile}, ${mobileFile}`);
      console.log(`  📊 Hasil Ringkas:`);
      console.log(`     - Desktop Horizontal Scroll: ${desktopMetrics.hasHorizontalScroll ? '❌ BOCOR' : '✅ AMAN'}`);
      console.log(`     - Mobile Horizontal Scroll: ${mobileMetrics.hasHorizontalScroll ? '❌ BOCOR' : '✅ AMAN'}`);
      console.log(`     - Solid Buttons: ${desktopMetrics.solidButtonsCount} (${desktopMetrics.solidButtonsSamples.join(', ') || 'None'})`);
      console.log(`     - Container Clamping: ${wideContainerMetrics.hasMaxWClamp ? '✅' : '⚠️'} (${wideContainerMetrics.containerClass})`);
      console.log(`     - Mobile Stacked Tabs: ${mobileMetrics.hasStackedTabs ? '⚠️ Menumpuk' : '✅ Bersih'}`);
    }

    await browser.close();

    const reportPath = path.join(SCREENSHOT_DIR, 'audit_summary_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2), 'utf-8');
    console.log(`\n🎉 [UI AUDITOR] Audit Selesai! Laporan tersimpan di: ${reportPath}`);
  } catch (err) {
    console.error('❌ [UI AUDITOR] Error saat audit:', err);
  } finally {
    previewProcess.kill();
    console.log('🛑 [UI AUDITOR] Preview Server dihentikan.');
  }
}

runAuditor();

