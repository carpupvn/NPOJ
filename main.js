let problems = [];
let activeProb = null;

// --- QUẢN LÝ GIAO DIỆN & HIỆU ỨNG CHUYỂN TRANG ---
function switchView(v) {
    const allViews = document.querySelectorAll('.view');
    const appContent = document.getElementById('app-content');
    const viewStart = document.getElementById('view-start');

    // 1. Ẩn tất cả các view ngay lập tức để giải phóng giao diện
    allViews.forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden');
    });

    // 2. Xử lý logic hiển thị
    if (v === 'start') {
        appContent.classList.add('hidden');
        viewStart.classList.remove('hidden');
        viewStart.style.display = 'flex'; // Đảm bảo flex để căn giữa
        setTimeout(() => viewStart.classList.add('active'), 10);
    } else {
        // Nếu vào User hoặc Admin, phải cất hẳn màn hình Start đi
        viewStart.classList.add('hidden');
        viewStart.style.display = 'none';
        
        appContent.classList.remove('hidden');
        const target = document.getElementById('view-' + v);
        if (target) {
            target.classList.remove('hidden');
            setTimeout(() => target.classList.add('active'), 10);
        }
    }

    // 3. Load dữ liệu
    if (v === 'user' || v === 'admin') loadData();
}

// --- HIỆU ỨNG HOẠT ẢNH CHO TẤT CẢ NÚT BẤM ---
function applyButtonEffects() {
    const btns = document.querySelectorAll('button');
    btns.forEach(btn => {
        btn.style.transition = "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
        btn.onmouseover = () => {
            btn.style.transform = "translateY(-3px) scale(1.05)";
            btn.style.filter = "brightness(1.2)";
            btn.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
        };
        btn.onmouseout = () => {
            btn.style.transform = "translateY(0) scale(1)";
            btn.style.filter = "brightness(1)";
            btn.style.boxShadow = "none";
        };
        btn.onmousedown = () => btn.style.transform = "translateY(1px) scale(0.95)";
        btn.onmouseup = () => btn.style.transform = "translateY(-3px) scale(1.05)";
    });
}

// --- QUẢN LÝ DỮ LIỆU ---
async function loadData() {
    try {
        const v = Date.now();
        // Đọc danh mục bài tập từ list.json
        const response = await fetch(`list.json?v=${v}`);
        if (!response.ok) throw new Error("Không tìm thấy list.json");
        const fileNames = await response.json();
        
        problems = [];
        for (const fileName of fileNames) {
            // Tải từng bài tập từ các file JSON ngang hàng
            const res = await fetch(`${encodeURIComponent(fileName)}?v=${v}`);
            if (res.ok) {
                const probData = await res.json();
                problems.push(probData);
            }
        }
        renderUserProblems();
        renderAdminProblems();
        applyButtonEffects();
    } catch (e) {
        console.error("Lỗi tải bài tập:", e);
        const grid = document.getElementById('prob-grid');
        if(grid) grid.innerHTML = "<p style='color:#f43f5e'>Lỗi: Không thể tải bài tập từ GitHub.</p>";
    }
}
function renderAdminProblems() {
    const list = document.getElementById('admin-list');
    if (!list) return;
    list.innerHTML = problems.map(p => `
        <div class="card admin-item-card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center">
            <div>
                <strong>${p.title}</strong>
                <div style="color:#64748b; font-size:12px">${p.lang.toUpperCase()}</div>
            </div>
            <div style="display:flex; gap:10px">
                <button class="btn-outline" onclick="openEditor('${p.id}')">SỬA</button>
                <button class="btn-danger">XÓA</button>
            </div>
        </div>
    `).join('');
    applyButtonEffects();
}
function renderUserProblems() {
    const grid = document.getElementById('prob-grid');
    if (!grid) return;
    grid.innerHTML = problems.map(p => `
        <div class="card problem-card" onclick="openSolve('${p.id}')">
            <div class="prob-status" style="background: ${p.lang === 'cpp' ? '#3b82f6' : '#eab308'}">
                ${p.lang.toUpperCase()}
            </div>
            <h3 style="margin:10px 0">${p.title}</h3>
            <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin-bottom:0">
                ${p.desc.substring(0, 100)}${p.desc.length > 100 ? '...' : ''}
            </p>
            <div style="margin-top:15px; font-size:11px; color:var(--primary); font-weight:bold; letter-spacing:1px">
                NHẤN ĐỂ LÀM BÀI →
            </div>
        </div>
    `).join('');
}

// --- EDITOR (MÀU C++ & AUTO INDENT) ---
function updateHighlighting() {
    const editor = document.getElementById('code-editor');
    const display = document.getElementById('highlighting-content');
    if (editor && display) {
        display.style.color = "#fff"; 
        let lang = (activeProb && activeProb.lang === 'cpp') ? 'cpp' : 'python';
        display.className = `language-${lang}`;
        display.textContent = editor.value + (editor.value.endsWith("\n") ? " " : ""); 
        if (window.Prism) Prism.highlightElement(display);
    }
}

function handleEditorKeys(e) {
    const editor = e.target;
    const s = editor.selectionStart;
    const v = editor.value;

    if (e.key === 'Tab') {
        e.preventDefault();
        editor.value = v.substring(0, s) + "    " + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 4;
        updateHighlighting();
    }
    
    // Xử lý Backspace lùi 4 dấu cách
    if (e.key === 'Backspace') {
        const textBefore = v.substring(0, s);
        if (textBefore.endsWith('    ')) {
            e.preventDefault();
            editor.value = v.substring(0, s - 4) + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s - 4;
            updateHighlighting();
        }
    }

    // Tự động đóng ngoặc và xuống dòng thông minh
    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    if (pairs[e.key]) {
        e.preventDefault();
        const close = pairs[e.key];
        editor.value = v.substring(0, s) + e.key + close + v.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 1;
        updateHighlighting();
    }

    if (e.key === 'Enter') {
        const lastLine = v.substring(0, s).split('\n').pop();
        const indent = lastLine.match(/^\s*/)[0];
        const charBefore = v[s - 1];
        const charAfter = v[s];

        if (charBefore === '{' && charAfter === '}') {
            e.preventDefault();
            editor.value = v.substring(0, s) + "\n" + indent + "    \n" + indent + v.substring(s);
            editor.selectionStart = editor.selectionEnd = s + indent.length + 5;
            updateHighlighting();
        } else {
            e.preventDefault();
            let extraIndent = "";
            if (activeProb?.lang === 'python' && lastLine.trim().endsWith(':')) extraIndent = "    ";
            if (activeProb?.lang === 'cpp' && lastLine.trim().endsWith('{')) extraIndent = "    ";
            editor.value = v.substring(0, s) + "\n" + indent + extraIndent + v.substring(editor.selectionEnd);
            editor.selectionStart = editor.selectionEnd = s + 1 + indent.length + extraIndent.length;
            updateHighlighting();
        }
    }
}

// --- ENGINE CHẤM BÀI (THANG ĐIỂM 100 & SAI SỐ 0.0001) ---
function compareOutputs(received, expected) {
    const recStr = received.trim();
    const expStr = expected.trim();
    if (recStr === expStr) return true;

    // Kiểm tra sai số cho số thực
    const recNum = parseFloat(recStr);
    const expNum = parseFloat(expStr);
    if (!isNaN(recNum) && !isNaN(expNum)) {
        return Math.abs(recNum - expNum) <= 0.0001;
    }
    return false;
}

async function executePiston(code, input, lang) {
    try {
        const response = await fetch("https://emkc.org/api/v2/piston/execute", {
            method: "POST",
            body: JSON.stringify({
                language: lang === "cpp" ? "cpp" : "python",
                version: lang === "cpp" ? "10.2.0" : "3.10.0",
                files: [{ content: code }],
                stdin: input
            })
        });
        const result = await response.json();
        if (result.compile && result.compile.stderr) return { error: result.compile.stderr };
        return { output: result.run.output };
    } catch (e) { return { error: "Lỗi kết nối bộ chấm." }; }
}

async function runCode() {
    const code = document.getElementById('code-editor').value;
    const status = document.getElementById('judge-status');
    const term = document.getElementById('terminal');
    if (!activeProb) return;
    
    // Reset terminal và điểm về 0 ngay khi bấm nút để tránh lưu điểm cũ
    term.innerHTML = `<span style="color:#60a5fa">>> Đang khởi tạo...</span>\n`;
    status.innerText = "ĐANG CHẤM...";
    status.style.color = "#60a5fa";

    let earnedPoints = 0; // Biến tích lũy điểm mới

    for (let i = 0; i < activeProb.tests.length; i++) {
        const test = activeProb.tests[i];
        try {
            const response = await fetch("https://emkc.org/api/v2/piston/execute", {
                method: "POST",
                body: JSON.stringify({
                    language: activeProb.lang === "cpp" ? "cpp" : "python",
                    version: activeProb.lang === "cpp" ? "10.2.0" : "3.10.0",
                    files: [{ content: code }],
                    stdin: test.input
                })
            });
            const result = await response.json();
            const output = (result.run?.output || "").trim();

            // Sử dụng hàm compareOutputs đã có sai số 0.0001 của bạn
            if (compareOutputs(output, test.output)) {
                const p = parseInt(test.point) || 0;
                earnedPoints += p; // Cộng dồn điểm thực tế từ file JSON
                term.innerHTML += `<span style="color:#4ade80">Test ${i+1}: ĐÚNG (+${p}đ)</span>\n`;
            } else {
                term.innerHTML += `<span style="color:#f43f5e">Test ${i+1}: SAI</span>\n`;
            }
        } catch (e) { 
            term.innerHTML += `Lỗi kết nối bộ chấm\n`; 
        }
        term.scrollTop = term.scrollHeight;
    }
    
    // Hiển thị tổng điểm cộng dồn (có thể là 120/100)
    status.innerText = `KẾT QUẢ: ${earnedPoints}/100 ĐIỂM`;
    status.style.color = earnedPoints >= 100 ? "#10b981" : "#f59e0b";
}

// --- QUẢN LÝ ---
function openSolve(id) {
    activeProb = problems.find(p => String(p.id) === String(id));
    document.getElementById('solve-title').innerText = activeProb.title;
    document.getElementById('solve-desc').innerText = activeProb.desc;
    document.getElementById('lang-tag').innerText = activeProb.lang.toUpperCase();
    document.getElementById('terminal').innerHTML = '';
    document.getElementById('code-editor').value = '';
    
    // Reset trạng thái điểm hiển thị khi mở bài mới
    const status = document.getElementById('judge-status');
    if(status) {
        status.innerText = "Đang đợi code...";
        status.style.color = "var(--text-sub)";
    }
    
    updateHighlighting();
    switchView('solve');
}

function openEditor(id = null) {
    const container = document.getElementById('test-container');
    container.innerHTML = '';
    if (id) {
        const p = problems.find(x => String(x.id) === String(id));
        document.getElementById('adm-title').value = p.title;
        document.getElementById('adm-desc').value = p.desc;
        document.getElementById('adm-lang').value = p.lang;
        p.tests.forEach(t => addTestUI(t.input, t.output, t.point));
    } else {
        document.getElementById('adm-title').value = '';
        addTestUI();
    }
    switchView('editor');
}

function addTestUI(i="", o="", p=50) {
    const d = document.createElement('div');
    d.className = "testcase-row";
    d.innerHTML = `
        <textarea class="ti" placeholder="Input">${i}</textarea>
        <textarea class="to" placeholder="Output">${o}</textarea>
        <div style="display:flex; flex-direction:column; gap:5px">
            <input type="number" class="tp" value="${p}">
            <button class="btn-danger" onclick="this.parentElement.parentElement.remove()">Xóa</button>
        </div>`;
    document.getElementById('test-container').appendChild(d);
    applyButtonEffects();
}

async function saveProblem() {
    const ts = [];
    document.querySelectorAll('.testcase-row').forEach(r => {
        ts.push({ input: r.querySelector('.ti').value, output: r.querySelector('.to').value, point: parseInt(r.querySelector('.tp').value) });
    });
    const data = { id: Date.now(), title: document.getElementById('adm-title').value, desc: document.getElementById('adm-desc').value, lang: document.getElementById('adm-lang').value, tests: ts };
    try {
        const h = await window.showSaveFilePicker({ suggestedName: data.title + '.json' });
        const w = await h.createWritable();
        await w.write(JSON.stringify(data, null, 2));
        await w.close();
    } catch (e) {}
}

function authAdmin() {
    if (prompt("Mã bảo mật:") === "05122010") switchView('admin');
}

window.onload = () => {
    const ed = document.getElementById('code-editor');
    if(ed) {
        ed.onkeydown = handleEditorKeys;
        ed.oninput = updateHighlighting;
        ed.onscroll = () => {
            const layer = document.getElementById('highlighting-layer');
            if(layer) layer.scrollTop = ed.scrollTop;
        };

        // Thêm đoạn này vào đây
        ed.addEventListener('focus', function() {
            if (window.innerWidth < 768) {
                setTimeout(() => {
                    this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        });
    }
    applyButtonEffects(); 
};




