/*
 * สคริปต์หลักสำหรับโหลดข้อมูลจาก Supabase และสร้างกราฟด้วย Chart.js
 * ฟังก์ชันทั้งหมดใช้รูปแบบ asynchronous เพื่อรอผลลัพธ์จากฐานข้อมูล
 */

// กำหนด URL และ public anon key ของโครงการ Supabase จากข้อมูลที่ผู้ใช้ให้มา
const SUPABASE_URL = 'https://jkenfjjxwdckmvqjkdkp.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZW5mamp4d2Rja212cWprZGtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4MjA5NjIsImV4cCI6MjA2NjM5Njk2Mn0.3VOZpt4baNnC5-qpYq6dC9UZ0gcfI2V4aTdi1itxmXI';

// สร้างอินสแตนซ์ Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * แปลงวันที่ในรูป ISO 8601 ให้เป็นสตริงในรูปแบบที่เข้าใจง่าย (เช่น 10/08/2025)
 * โดยใช้เขตเวลาในเบราว์เซอร์ของผู้ใช้
 * @param {string} isoString - สตริงวันที่แบบ ISO 8601
 * @returns {string} - วันที่ในรูปแบบ DD/MM/YYYY
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * สร้างตาราง HTML จากข้อมูลยอดขายรายวัน
 * @param {object} dailyData - ข้อมูลรูปแบบ { date: { productName: quantity, ... }, ... }
 */
function renderDailyTable(dailyData) {
  const container = document.getElementById('dailySalesTable');
  container.innerHTML = '';
  // ตรวจหาผลิตภัณฑ์ทั้งหมดเพื่อนำไปสร้างหัวตาราง
  const productNames = new Set();
  for (const date in dailyData) {
    const productsObj = dailyData[date];
    Object.keys(productsObj).forEach((name) => productNames.add(name));
  }
  const headerRow = ['วันที่', ...Array.from(productNames)];
  // สร้างตาราง
  let html = '<table><thead><tr>';
  headerRow.forEach((title) => {
    html += `<th>${title}</th>`;
  });
  html += '</tr></thead><tbody>';
  // สร้างแถวของแต่ละวัน
  const sortedDates = Object.keys(dailyData).sort(
    (a, b) => new Date(a.split('/').reverse().join('/')) - new Date(b.split('/').reverse().join('/'))
  );
  sortedDates.forEach((date) => {
    html += '<tr>';
    html += `<td>${date}</td>`;
    productNames.forEach((name) => {
      const qty = dailyData[date][name] || 0;
      html += `<td>${qty}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * ฟังก์ชันหลักสำหรับดึงข้อมูลจากฐานข้อมูลแล้วสร้างกราฟและสรุป
 */
async function loadAnalytics() {
  try {
    // ดึงข้อมูลจากตาราง sales และ products
    const { data: salesData, error: salesError } = await supabaseClient
      .from('sales')
      .select('*');
    const { data: productData, error: productError } = await supabaseClient
      .from('products')
      .select('id, name');
    if (salesError || productError) {
      console.error('เกิดข้อผิดพลาดขณะดึงข้อมูล:', salesError || productError);
      document.getElementById('summary').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
      return;
    }

    // สร้างแผนที่ (map) สำหรับ product_id -> name
    const productMap = {};
    productData.forEach((prod) => {
      productMap[prod.id] = prod.name;
    });

    // ข้อมูลสำหรับสรุป
    let totalUnits = 0;
    const transactionSet = new Set();
    const productSales = {};
    const dailySales = {};
    const hourSales = Array(24).fill(0);
    const customerTrend = {};

    salesData.forEach((sale) => {
      const { product_id, quantity, created_at, transaction_id } = sale;
      const productName = productMap[product_id] || 'ไม่ทราบชื่อ';
      // รวมปริมาณทั้งหมด
      totalUnits += quantity;
      // เก็บ unique transaction_id เพื่อนับลูกค้า
      if (transaction_id) transactionSet.add(transaction_id);
      // ยอดขายแยกตามสินค้า
      productSales[productName] = (productSales[productName] || 0) + quantity;
      // ยอดขายรายวัน
      const dateStr = formatDate(created_at);
      if (!dailySales[dateStr]) dailySales[dateStr] = {};
      dailySales[dateStr][productName] = (dailySales[dateStr][productName] || 0) + quantity;
      // ยอดขายแยกตามชั่วโมง
      const hour = new Date(created_at).getHours();
      hourSales[hour] += quantity;
      // แนวโน้มลูกค้า (จำนวนลูกค้าต่อวัน) นับจาก transaction_id ที่ไม่ซ้ำ
      if (!customerTrend[dateStr]) customerTrend[dateStr] = new Set();
      customerTrend[dateStr].add(transaction_id);
    });

    // สรุปยอดรวมสำหรับแสดงในหน้าหลัก
    const totalCustomers = transactionSet.size;
    // หาสินค้าขายดีอันดับต้น ๆ (Top products)
    const topProductsArray = Object.entries(productSales)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
    const topProducts = topProductsArray.slice(0, 5);
    // สร้างข้อมูลสำหรับกราฟสินค้าขายดี
    const topLabels = topProducts.map((p) => p.name);
    const topQuantities = topProducts.map((p) => p.qty);

    // สร้างข้อมูลสำหรับกราฟแนวโน้มลูกค้า
    const trendEntries = Object.entries(customerTrend)
      .map(([date, set]) => ({ date, count: set.size }))
      .sort((a, b) => new Date(a.date.split('/').reverse().join('/')) - new Date(b.date.split('/').reverse().join('/')));
    const trendLabels = trendEntries.map((entry) => entry.date);
    const trendValues = trendEntries.map((entry) => entry.count);

    // สร้างข้อมูลสำหรับกราฟช่วงเวลายอดขาย (รายชั่วโมง)
    const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    // หาชั่วโมงที่มียอดขายสูงสุดและต่ำสุด
    let maxHour = 0;
    let minHour = 0;
    hourSales.forEach((val, idx) => {
      if (hourSales[idx] > hourSales[maxHour]) maxHour = idx;
      if (hourSales[idx] < hourSales[minHour]) minHour = idx;
    });

    // แสดงข้อความสรุป
    const summaryEl = document.getElementById('summary');
    summaryEl.textContent = `รวมขายได้ทั้งหมด ${totalUnits.toLocaleString()} ชิ้น ใน ${totalCustomers.toLocaleString()} รายการ โดยสินค้าขายดีที่สุดคือ "${topProductsArray.length > 0 ? topProductsArray[0].name : 'ไม่มีข้อมูล'}" และช่วงเวลาที่มียอดขายสูงสุดคือ ${maxHour}:00‑${maxHour + 1}:00 น.`;

    // สร้างตารางยอดขายรายวัน
    renderDailyTable(dailySales);

    // กำจัดกราฟเดิมถ้ามี (กรณีรีโหลด)
    if (window.topProductsChart) window.topProductsChart.destroy();
    if (window.customerTrendChart) window.customerTrendChart.destroy();
    if (window.timeChart) window.timeChart.destroy();

    // กราฟสินค้าขายดี
    const topCtx = document.getElementById('topProductsChart').getContext('2d');
    window.topProductsChart = new Chart(topCtx, {
      type: 'bar',
      data: {
        labels: topLabels,
        datasets: [
          {
            label: 'จำนวนที่ขาย (ชิ้น)',
            data: topQuantities,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'สินค้าขายดี (Top‑Selling Products)',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'จำนวน (ชิ้น)',
            },
          },
        },
      },
    });

    // กราฟแนวโน้มลูกค้า
    const trendCtx = document
      .getElementById('customerTrendChart')
      .getContext('2d');
    window.customerTrendChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [
          {
            label: 'จำนวนลูกค้า (คน)',
            data: trendValues,
            fill: false,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'แนวโน้มจำนวนลูกค้าต่อวัน',
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'วันที่',
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'จำนวนลูกค้า',
            },
          },
        },
      },
    });

    // กราฟช่วงเวลายอดขาย
    const timeCtx = document.getElementById('timeChart').getContext('2d');
    window.timeChart = new Chart(timeCtx, {
      type: 'bar',
      data: {
        labels: hourLabels,
        datasets: [
          {
            label: 'จำนวนที่ขาย (ชิ้น)',
            data: hourSales,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'ยอดขายตามช่วงเวลา (รายชั่วโมง)',
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'เวลา (ชั่วโมง)',
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'จำนวน (ชิ้น)',
            },
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
    document.getElementById('summary').textContent = 'ไม่สามารถโหลดข้อมูลได้';
  }
}

// เมื่อหน้าเว็บโหลดเสร็จ ให้เรียกฟังก์ชันสำหรับดึงข้อมูลและสร้างกราฟ
window.addEventListener('DOMContentLoaded', () => {
  loadAnalytics();
});