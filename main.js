let problems = [];
let activeProb = null;
let currentCode = null;

// --- 1. QUẢN LÝ TRUY CẬP THEO MÃ (MỚI) ---
async function accessByCode(forcedCode = null) {
    const codeInput = document.getElementById('exercise-code');
    const code = forcedCode || codeInput.value.trim();
    const loader = document.getElementById('loader');

    if (!code) {
        alert("Vui lòng nhập mã số bài tập!");
        return;
    }

    if (loader) loader.style.display = 'block';

    try {
        const v = Date.now();
        // Truy cập vào folder mã số để lấy list.json
        const response = await fetch(`data/${code}/list.json?v=${v}`);
        
        if (!response.ok) throw new Error("Mã bài tập không tồn tại!");

        const fileConfigs = await response.json();
        
        // Tải chi tiết các file .json bài tập trong folder đó
        const promises = fileConfigs.map(item => 
            fetch(`data/${code}/${encodeURIComponent(item.filename)}.json?v=${v}`)
                .then(res => res.ok ? res.json() : null)
        );
        
        const results = await Promise.all(promises);
        problems = results.filter(p => p !== null);
        currentCode = code;

        // Lưu mã vào URL mà không load lại trang
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?ma=${code}`;
        window.history.pushState({ path: newUrl }, '', newUrl);

        // Hiển thị giao diện
        document.getElementById('display-ma').innerText = code;
        switchView('user');

    } catch (e) {
        alert(e.message);
        logout();
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function logout() {
    // Xóa tham số URL
    const baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: baseUrl }, '', baseUrl);
    
    problems = [];
    currentCode = null;
    
    // Reset giao diện về màn hình chào
    document.getElementById('app-content').classList.add('hidden');
    const viewStart = document.getElementById('view-start');
    viewStart.style.display = 'flex';
    viewStart.classList.add('active');
    
    document.getElementById('exercise-code').value = '';
}

// --- 2. QUẢN LÝ GIAO DIỆN ---
function switchView(v) {
    const allViews = document.querySelectorAll('.view');
    const viewStart = document.getElementById('view-start');
    const appContent = document.getElementById('app-content');

    allViews.forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none'; 
    });

    if (v === 'start') {
        appContent.classList.add('hidden');
        viewStart.style.display = 'flex';
        setTimeout(() => viewStart.classList.add('active'), 10);
    } else {
        viewStart.style.display = 'none';
        viewStart.classList.remove('active');
        appContent.classList.remove('hidden');
        
        const target = document.getElementById('view-' + v);
        if (target) {
            target.style.display = 'block';
            setTimeout(() => target.classList.add('active'), 10);
        }
    }

    if (v === 'user') renderUserProblems();
    if (v === 'admin') renderAdminProblems();
    applyButtonEffects();
}

// --- 3. HIỂN THỊ BÀI TẬP ---
function renderUserProblems() {
    const grid = document.getElementById('prob-grid');
    if (!grid) return;
    
    if (problems.length === 0) {
        grid.innerHTML = "<p style='color:#94a3b8; grid-column:1/-1; text-align:center;'>Folder này chưa có bài tập nào.</p>";
        return;
    }

    grid.innerHTML = problems.map(p => `
        <div class="card problem-card" onclick="openSolve('${p.id}')">
            <div class="prob-status" style="background: ${p.lang === 'cpp' ? '#3b82f6' : '#eab308'}">
                ${p.lang.toUpperCase()}
            </div>
            <h3 style="margin:10px 0">${p.title}</h3>
            <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin-bottom:0">
                ${p.desc.substring(0, 100)}${p.desc.length > 100 ? '...' : ''}
            </p>
        </div>
    `).join('');
}

function openSolve(id) {
    activeProb = problems.find(p => String(p.id) === String(id));
    if (!activeProb) return;

    document.getElementById('solve-title').innerText = activeProb.title;
    document.getElementById('solve-desc').innerText = activeProb.desc;
    document.getElementById('lang-tag').innerText = activeProb.lang.toUpperCase();
    document.getElementById('terminal').innerHTML = '';
    document.getElementById('code-editor').value = '';
    
    const status = document.getElementById('judge-status');
    status.innerText = "Sẵn sàng.";
    status.style.color = "#94a3b8";
    
    updateHighlighting();
    switchView('solve');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 4. ENGINE CHẤM BÀI (GIỮ NGUYÊN LOGIC CỦA BẠN) ---
function compareOutputs(received, expected) {
    const recStr = received.trim();
    const expStr = expected.trim();
    if (recStr === expStr) return true;
    const recNum = parseFloat(recStr);
    const expNum = parseFloat(expStr);
    if (!isNaN(recNum) && !isNaN(expNum)) {
        return Math.abs(recNum - expNum) <= 0.0001;
    }
    return false;
}

async function runCode() {
    const code = document.getElementById('code-editor').value;
    const status = document.getElementById('judge-status');
    const term = document.getElementById('terminal');
    if (!activeProb) return;
    
    term.innerHTML = `<span style="color:#60a5fa">>> Đang khởi tạo...</span>\n`;
    status.innerText = "ĐANG CHẤM...";
    status.style.color = "#60a5fa";

    let earnedPoints = 0;

    // Chạy qua toàn bộ mảng tests trong JSON
    for (let i = 0; i < activeProb.tests.length; i++) {
        const test = activeProb.tests[i];
        try {
            // Thêm await để đợi từng test một, tránh bị API chặn do gửi quá nhanh
            const response = await fetch("https://emkc.org/api/v2/piston/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    language: activeProb.lang === "cpp" ? "cpp" : "python",
                    version: activeProb.lang === "cpp" ? "10.2.0" : "3.10.0",
                    files: [{ content: code }],
                    stdin: test.input
                })
            });
            
            const result = await response.json();
            const output = (result.run?.output || "").trim();

            if (compareOutputs(output, test.output)) {
                const p = parseInt(test.point) || 0;
                earnedPoints += p;
                term.innerHTML += `<span style="color:#4ade80">Test ${i+1}: ĐÚNG (+${p}đ)</span>\n`;
            } else {
                term.innerHTML += `<span style="color:#f43f5e">Test ${i+1}: SAI</span>\n`;
            }
        } catch (e) { 
            term.innerHTML += `<span style="color:#ef4444">Test ${i+1}: Lỗi kết nối bộ chấm</span>\n`; 
        }
        term.scrollTop = term.scrollHeight;
        
        // Nghỉ một chút giữa các test (50ms) để ổn định kết nối API
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Hiển thị tổng điểm thực tế (không giới hạn 100)
    status.innerText = `KẾT QUẢ: ${earnedPoints} ĐIỂM`;
    status.style.color = "#10b981";

    if (earnedPoints > 0) {
        showCongrats();
    }
}
// --- 5. EDITOR & HIỆU ỨNG (GIỮ NGUYÊN) ---
function updateHighlighting() {
    const editor = document.getElementById('code-editor');
    const display = document.getElementById('highlighting-content');
    const highlighting = document.getElementById('highlighting');
    
    if (editor && display) {
        let lang = (activeProb && activeProb.lang === 'cpp') ? 'cpp' : 'python';
        display.className = `language-${lang}`;
        // Thêm khoảng trống ở cuối để tránh lệch dòng khi có xuống dòng mới
        display.textContent = editor.value + (editor.value.endsWith("\n") ? " " : ""); 
        
        if (window.Prism) Prism.highlightElement(display);

        // Đảm bảo cuộn ngay lập tức khi nội dung thay đổi
        highlighting.scrollTop = editor.scrollTop;
        highlighting.scrollLeft = editor.scrollLeft;
    }
}

function handleEditorKeys(e) {
    const editor = e.target;
    const s = editor.selectionStart;
    const v = editor.value;

    // 1. Tab: Thêm 4 dấu cách
    if (e.key === 'Tab') {
        e.preventDefault();
        editor.value = v.substring(0, s) + "    " + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 4;
        updateHighlighting();
    }
    
    // 2. Backspace thông minh: Xóa một lần 4 dấu cách
    if (e.key === 'Backspace') {
        const textBefore = v.substring(0, s);
        if (textBefore.endsWith('    ')) {
            e.preventDefault();
            editor.value = v.substring(0, s - 4) + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s - 4;
            updateHighlighting();
        }
    }

    // 3. Tự động đóng ngoặc cặp
    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    if (pairs[e.key]) {
        e.preventDefault();
        const close = pairs[e.key];
        editor.value = v.substring(0, s) + e.key + close + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 1;
        updateHighlighting();
    }

    // 4. Enter: Xuống dòng và tự động lùi đầu dòng (Auto-indent)
    if (e.key === 'Enter') {
        const lastLine = v.substring(0, s).split('\n').pop();
        const indent = lastLine.match(/^\s*/)[0];
        const charBefore = v[s - 1];
        const charAfter = v[s];

        // Nếu nhấn Enter giữa cặp dấu ngoặc nhọn { | }
        if (charBefore === '{' && charAfter === '}') {
            e.preventDefault();
            editor.value = v.substring(0, s) + "\n" + indent + "    \n" + indent + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s + indent.length + 5;
            updateHighlighting();
        } else {
            e.preventDefault();
            let extraIndent = "";
            // Thêm lùi dòng nếu dòng trước kết thúc bằng dấu : (Python) hoặc { (C++)
            if (activeProb?.lang === 'python' && lastLine.trim().endsWith(':')) extraIndent = "    ";
            if (activeProb?.lang === 'cpp' && lastLine.trim().endsWith('{')) extraIndent = "    ";
            
            editor.value = v.substring(0, s) + "\n" + indent + extraIndent + v.substring(editor.selectionEnd);
            editor.selectionStart = editor.selectionEnd = s + 1 + indent.length + extraIndent.length;
            updateHighlighting();
        }
    }
}

function applyButtonEffects() {
    const btns = document.querySelectorAll('button');
    btns.forEach(btn => {
        btn.onmouseover = () => btn.style.transform = "translateY(-2px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";
    });
}

// --- 6. KHỞI TẠO HỆ THỐNG ---
window.onload = () => {
    // ... các đoạn code cũ giữ nguyên ...

    const ed = document.getElementById('code-editor');
    const highlighting = document.getElementById('highlighting'); // Thẻ cha của phần hiển thị

    if(ed && highlighting) {
        ed.onkeydown = handleEditorKeys;
        ed.oninput = updateHighlighting;

        // Đồng bộ lăn chuột
        ed.onscroll = () => {
            highlighting.scrollTop = ed.scrollTop;
            highlighting.scrollLeft = ed.scrollLeft;
        };
    }
    applyButtonEffects(); 
};

function authAdmin() {
    if (prompt("Mã bảo mật:") === "05122010") switchView('admin');
}

// Hàm tạo pháo hoa
function launchFireworks() {
    const colors = ['#ff0', '#f0f', '#0ff', '#0f0', '#fff', '#ff4500'];
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'firework-particle';
            
            // Vị trí xuất hiện ngẫu nhiên
            const x = Math.random() * window.innerWidth;
            const y = window.innerHeight;
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.backgroundColor = color;
            particle.style.boxShadow = `0 0 10px ${color}`;
            
            document.body.appendChild(particle);
            
            // Hiệu ứng bay lên và nổ
            const destX = x + (Math.random() - 0.5) * 200;
            const destY = Math.random() * (window.innerHeight * 0.5);
            
            particle.animate([
                { transform: `translate(0, 0)`, opacity: 1 },
                { transform: `translate(${destX - x}px, ${destY - y}px)`, opacity: 0 }
            ], {
                duration: 1000 + Math.random() * 1000,
                easing: 'ease-out',
                fill: 'forwards'
            });

            setTimeout(() => particle.remove(), 2000);
        }, i * 100);
    }
}

// Hàm hiển thị lời chúc
function showCongrats() {
    const modal = document.getElementById('congrats-modal');
    modal.classList.add('active');
    launchFireworks();
    
    // Tự động ẩn sau 5 giây
    setTimeout(() => {
        modal.classList.remove('active');
    }, 5000);
}

// --- LOGIC CHÈN VÀO HÀM CHẤM BÀI CỦA BẠN ---
// Giả sử hàm chấm bài của bạn tính ra biến totalPoint
if (totalPoint === 100) {
    showCongrats();
}