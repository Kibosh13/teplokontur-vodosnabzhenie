'use strict';
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');
let csrf = '', schema, serverState, values, media = [], history = [], user = 'admin';
let route = 'dashboard', page = 'home', editorTab = 'texts', busy = false, dirty = false, search = '', toastTimer;
const icons = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  pages:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 12h8M8 16h6"/>',
  photos:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  contacts:'<path d="M21 16v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.3 2 2 0 0 1 3.1 1h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L7.1 9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7A2 2 0 0 1 21 16z"/>',
  seo:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6M11 8v6"/>',
  history:'<path d="M3 11a9 9 0 1 1 3 7M3 3v8h8M12 7v5l3 2"/>',
  settings:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external:'<path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  logout:'<path d="M9 21H4V3h5M13 7l5 5-5 5M8 12h10"/>',
  lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.pages}</svg>`;
const e = str => String(str ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date = value => value ? new Intl.DateTimeFormat('ru-RU', {dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Moscow'}).format(new Date(value)) : 'Исходная версия';
const fieldsFor = (p, type) => Object.values(schema.fields).filter(f => f.page === p && (!type || f.type === type));
const changed = () => Object.keys(values || {}).filter(k => values[k] !== serverState.draft[k]);
const unpublished = () => Object.keys(values || {}).filter(k => values[k] !== serverState.published[k]);
function toast(message, error = false) {
  clearTimeout(toastTimer); toastEl.textContent = message; toastEl.className = `toast visible${error?' error':''}`;
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), error ? 7000 : 4000);
}
async function api(action, body, multipart = false) {
  const options = {credentials:'same-origin',headers:{}};
  if (body !== undefined) { options.method='POST'; options.headers['X-CSRF-Token']=csrf; options.body=multipart?body:JSON.stringify(body); if(!multipart)options.headers['Content-Type']='application/json'; }
  const response = await fetch(`/admin/api.php?action=${action}`, options);
  let data; try { data=await response.json(); } catch { throw new Error('Сервер вернул неожиданный ответ. Обновите страницу.'); }
  if (!response.ok) {
    if(response.status===401 && action!=='login') { login(); }
    throw new Error(data.error || 'Не удалось выполнить запрос.');
  }
  return data;
}
function login(mustChange = false) {
  modalRoot.innerHTML='';
  app.innerHTML=`<div class="login-layout"><aside class="login-aside"><div><img src="/assets/img/gvs-group-logo-inverse.svg" alt="GVS-Group"></div><div><div class="eyebrow-admin">ВАШ САЙТ. ВАШИ РЕШЕНИЯ.</div><h1>Всё нужное —<br>в одном месте.</h1><p>Обновляйте фотографии, рассказывайте о работах и управляйте содержанием сайта в удобном рабочем пространстве.</p></div><small>GVS-Group · Управление сайтом</small></aside><main class="login-main"><div class="login-card"><div class="eyebrow-admin">РАБОЧЕЕ ПРОСТРАНСТВО</div><h2>${mustChange?'Установите свой пароль':'Добро пожаловать'}</h2><p>${mustChange?'Первый вход выполнен. Замените временный пароль на свой — минимум 12 символов.':'Войдите, чтобы обновить сайт и подготовить новую публикацию.'}</p><form id="login-form">${mustChange?`<div><label class="field-label" for="current-password">Временный пароль</label><input id="current-password" name="current" type="password" autocomplete="current-password" required></div><div><label class="field-label" for="new-password">Новый пароль</label><input id="new-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></div><div><label class="field-label" for="repeat-password">Повторите новый пароль</label><input id="repeat-password" name="repeat" type="password" minlength="12" autocomplete="new-password" required></div>`:`<div><label class="field-label" for="username">Логин</label><input id="username" name="username" autocomplete="username" required placeholder="Ваш логин"></div><div><label class="field-label" for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Введите пароль"></div>`}<div class="login-error" id="login-error" role="alert"></div><button class="button primary" type="submit">${mustChange?'Сохранить пароль и продолжить':'Войти в панель'} ${icon('arrow')}</button></form><div class="login-foot">${icon('lock')} Доступ только для администратора сайта</div></div></main></div>`;
  document.getElementById('login-form').addEventListener('submit',async event=>{
    event.preventDefault(); const form=event.currentTarget, data=Object.fromEntries(new FormData(form)); const button=form.querySelector('button');
    if(mustChange && data.password!==data.repeat) { document.getElementById('login-error').textContent='Пароли не совпадают.';return; }
    button.disabled=true;
    try { const session=await api('session');csrf=session.csrf;const result=await api(mustChange?'password':'login',data); if(result.csrf)csrf=result.csrf; if(result.mustChange)login(true); else await load(); }
    catch(err) { document.getElementById('login-error').textContent=err.message; button.disabled=false; }
  });
}
async function load() {
  const data=await api('bootstrap'); schema=data.schema; serverState=data.state; values={...serverState.draft}; media=data.media; history=data.history; user=data.user;
  dirty=false; shell(); render();
}
function shell() {
  const navs=[['dashboard','Обзор'],['pages','Страницы сайта'],['photos','Медиатека'],['contacts','Компания и контакты'],['seo','SEO и поиск']];
  app.innerHTML=`<div class="shell"><div class="mobile-backdrop" data-close-menu></div><aside class="sidebar"><a href="/admin/" class="admin-brand"><img src="/assets/img/gvs-group-logo-inverse.svg" alt="GVS-Group"></a><div class="sidebar-eyebrow">Управление</div><nav>${navs.map(([id,label])=>`<button class="nav-btn" data-route="${id}">${icon(id)}<span>${label}</span>${id==='pages'?'<span class="nav-count">6</span>':''}</button>`).join('')}</nav><div class="sidebar-divider"></div><button class="nav-btn" data-route="history">${icon('history')}<span>История публикаций</span></button><button class="nav-btn" data-route="settings">${icon('settings')}<span>Безопасность</span></button><div class="sidebar-bottom"><a class="nav-btn" href="https://gvs-group.ru/" target="_blank" rel="noopener">${icon('external')}<span>Открыть сайт</span></a><div class="site-status"><span class="dot"></span> gvs-group.ru</div><div class="user-card"><span class="avatar">${e(user.slice(0,1).toUpperCase())}</span><div><strong>${e(user)}</strong><small>Администратор</small></div><button data-logout aria-label="Выйти из панели" title="Выйти">${icon('logout')}</button></div></div></aside><div class="workspace"><header class="topbar"><button class="mobile-menu-button" data-mobile-menu aria-label="Открыть навигацию">${icon('menu')}</button><div class="topbar-label">Сайт / <strong id="topbar-section">Обзор</strong></div><div class="toolbar"><span class="save-state" id="save-state"><span class="dot"></span><span>Сохранено</span></span><button class="button preview-top" data-preview>${icon('eye')} Предпросмотр</button><button class="button" data-save>${icon('save')} Сохранить</button><button class="button primary" data-publish>${icon('upload')} Опубликовать</button></div></header><main class="content" id="content"></main></div></div>`;
  app.onclick=onClick; app.oninput=onInput; updateToolbar();
}
const headings={dashboard:['Сайт под вашим контролем','Все страницы, фотографии и настройки — в одном рабочем пространстве.'],pages:['Страницы сайта','Выберите страницу и отредактируйте её блоки. Сохранённый черновик можно проверить до публикации.'],photos:['Медиатека','Фотографии и логотипы для вашего сайта. Загруженные изображения можно использовать в любом блоке.'],contacts:['Компания и контакты','Общие данные автоматически обновляются на всех страницах сайта.'],seo:['SEO и поиск','Настройте, как каждая страница выглядит в поиске и при отправке ссылки.'],history:['История публикаций','Перед каждой публикацией сохраняется предыдущая версия. Её можно восстановить одним действием.'],settings:['Безопасность','Смените пароль, чтобы управлять доступом к панели.']};
function render() {
  document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
  document.getElementById('topbar-section').textContent=headings[route][0];
  const heading=`<div class="page-heading"><div><div class="eyebrow-admin">GVS-GROUP / УПРАВЛЕНИЕ</div><h1>${headings[route][0]}</h1><p>${headings[route][1]}</p></div>${route==='photos'?`<button class="button primary" data-upload>${icon('upload')} Загрузить фото</button>`:''}</div>`;
  document.getElementById('content').innerHTML=heading+({dashboard:dashboard, pages:editor, seo:editor, photos:library, contacts:contacts, history:versions, settings:settings}[route])();
  updateToolbar();
  if(route==='settings')document.getElementById('password-form').addEventListener('submit',changePassword);
  if(route==='photos')bindDropzone();
}
function updateToolbar() {
  if(!serverState)return;
  dirty=changed().length>0; const badge=document.getElementById('save-state'); if(!badge)return;
  badge.classList.toggle('unsaved',dirty); badge.lastElementChild.textContent=busy?'Сохраняем…':dirty?'Есть изменения':'Сохранено';
  document.querySelectorAll('[data-save],[data-publish],[data-preview]').forEach(b=>b.disabled=busy);
  document.querySelectorAll('.content input,.content textarea,.content select').forEach(el=>el.disabled=busy);
}
function dashboard() {
  const draftCount=unpublished().length;
  return `<div class="welcome-banner"><div><div class="eyebrow-admin">НОВАЯ ПУБЛИКАЦИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div><h2>Добавьте свежие детали.<br>Покажите качество своей работы.</h2><p>Меняйте тексты и фотографии, уточняйте цены и контакты. Проверьте черновик и опубликуйте, когда всё готово.</p></div><button class="button" data-route="pages">Редактировать сайт ${icon('arrow')}</button></div><div class="stats"><div class="stat"><span class="stat-icon">${icon('pages')}</span><div><strong>6</strong><p>страниц сайта</p></div></div><div class="stat"><span class="stat-icon">${icon('photos')}</span><div><strong>${media.length}</strong><p>фотографий и логотипов</p></div></div><div class="stat"><span class="stat-icon">${icon('save')}</span><div><strong>${draftCount}</strong><p>изменений к публикации</p></div></div></div><div class="section-title"><h2>Выберите страницу</h2><small>Последняя публикация: ${e(date(serverState.publishedAt))}</small></div><div class="pages-grid">${Object.values(schema.pages).map(p=>{
    const image=fieldsFor(p.id,'image').find(f=>f.section!=='SEO');
    const count=fieldsFor(p.id).filter(f=>f.section!=='SEO'&&f.type!=='image').length;
    return `<button class="page-card" data-edit-page="${p.id}"><div class="page-cover"><img src="${e(image?values[image.id]:'/assets/img/hero-engineering.webp')}" alt="" loading="lazy"><span>${e(p.url)}</span></div><div class="page-card-body"><h3>${e(p.name)}</h3><div class="page-card-meta">${count} текстовых полей · ${fieldsFor(p.id,'image').filter(f=>f.section!=='SEO').length} фото</div><div class="page-card-link">Редактировать ${icon('arrow')}</div></div></button>`;
  }).join('')}</div><div class="info-card"><h3>От изменения до публикации</h3><div class="steps"><div class="step"><span class="step-num">1</span><strong>Отредактируйте</strong><p>Выберите страницу, блок текста или фотографию.</p></div><div class="step"><span class="step-num">2</span><strong>Проверьте черновик</strong><p>Сохраните изменения и откройте предпросмотр.</p></div><div class="step"><span class="step-num">3</span><strong>Опубликуйте</strong><p>Новая версия сразу появится на боевом сайте.</p></div></div></div>`;
}
function fieldHtml(f) {
  const value=values[f.id];
  if(f.type==='toggle')return `<div class="toggle-field"><input type="checkbox" id="${f.id}" data-field="${f.id}" ${value==='1'?'checked':''}><label for="${f.id}">${e(f.label)}<small>Отключение скрывает страницу от поиска и исключает её из карты сайта.</small></label></div>`;
  const max=f.id.endsWith('.seo.title')?60:f.id.endsWith('.seo.description')?160:null;
  return `<div class="field-row"><label class="field-label" for="${f.id}"><span>${e(f.label)}</span><span class="field-context">${e(f.hint||value.slice(0,75))}</span></label>${f.type==='textarea'?`<textarea id="${f.id}" data-field="${f.id}" rows="${value.length>220?4:3}" maxlength="10000">${e(value)}</textarea>`:`<input id="${f.id}" data-field="${f.id}" value="${e(value)}" type="${f.type==='email'?'email':f.type==='phone'?'tel':f.type==='url'?'url':'text'}" maxlength="10000">`}${max?`<div class="field-hint">${value.length} символов · ориентир ${max}. Короткий понятный текст лучше помещается в результатах поиска.</div>`:''}</div>`;
}
function photoField(f) {
  return `<div class="photo-field"><img src="${e(values[f.id])}" alt="${e(f.label)}" loading="lazy"><div class="photo-field-body"><p>${e(f.label)}</p><small>${e(f.section)}</small><div class="photo-field-actions"><button class="button small" data-select-image="${f.id}">${icon('photos')} Заменить фото</button><button class="button small ghost" data-upload-field="${f.id}">${icon('upload')} Загрузить</button></div>${f.altId?fieldHtml(schema.fields[f.altId]):''}</div></div>`;
}
function editor() {
  const isSeo=route==='seo'||editorTab==='seo'; const isPhoto=!isSeo&&editorTab==='photos';
  let fs=fieldsFor(page).filter(f=>isSeo?f.section==='SEO':isPhoto?(f.type==='image'&&f.section!=='SEO'):(f.section!=='SEO'&&f.type!=='image'&&!f.id.endsWith('.alt')));
  const query=search.toLocaleLowerCase('ru'); if(query)fs=fs.filter(f=>(f.label+' '+f.section+' '+values[f.id]).toLocaleLowerCase('ru').includes(query));
  const groups=new Map();fs.forEach(f=>{if(!groups.has(f.section))groups.set(f.section,[]);groups.get(f.section).push(f);});
  const chrome=['Шапка и меню','Подвал страницы','Форма заявки'];
  const rank=section=>chrome.includes(section)?chrome.indexOf(section)+1:0;
  const blocks=[...groups].sort((a,b)=>rank(a[0])-rank(b[0])).map(([section,fields],i)=>`<details class="field-section" ${i===0||query||isSeo||isPhoto?'open':''}><summary><span class="section-order">${String(i+1).padStart(2,'0')}</span><span>${e(section)}</span><span class="section-count">${fields.length} ${isPhoto?'фото':'полей'}</span><svg class="chevron" viewBox="0 0 24 24">${icons.chevron}</svg></summary><div class="fields">${isPhoto?`<div class="photo-fields">${fields.map(photoField).join('')}</div>`:fields.map(f=>f.type==='image'?photoField(f):fieldHtml(f)).join('')}</div></details>`).join('');
  return `<div class="editor-layout"><aside class="page-list">${Object.values(schema.pages).map(p=>`<button data-page="${p.id}" class="${page===p.id?'active':''}">${icon('pages')}${e(p.name)}</button>`).join('')}</aside><div class="editor"><div class="editor-top"><div class="editor-title-row"><div><h2>${e(schema.pages[page].name)}</h2><small>gvs-group.ru${e(schema.pages[page].url)}</small></div><button class="button small" data-preview>${icon('eye')} Посмотреть черновик</button></div>${route==='pages'?`<div class="editor-tabs"><button data-tab="texts" class="${editorTab==='texts'?'active':''}">Тексты и блоки</button><button data-tab="photos" class="${editorTab==='photos'?'active':''}">Фотографии</button><button data-tab="seo" class="${editorTab==='seo'?'active':''}">SEO страницы</button></div>`:''}<div class="search-wrap">${icon('seo')}<input id="field-search" placeholder="Найти текст или блок на странице…" value="${e(search)}"></div></div>${isSeo?`<div class="seo-note">${values[page+'.seo.index']==='1'?'Индексация разрешена. Страница доступна поисковым роботам.':'Индексация отключена для этой страницы. Изменение вступит в силу после публикации.'}</div><div class="seo-preview"><small>${e(values[page+'.seo.canonical'])}</small><h3>${e(values[page+'.seo.title'])}</h3><p>${e(values[page+'.seo.description'])}</p></div>`:''}${blocks||`<div class="empty">${icon(isPhoto?'photos':'seo')}<h3>${isPhoto&&!query?'На этой странице нет фотографий':'Ничего не найдено'}</h3><p>${query?'Попробуйте другой поисковый запрос.':'Используйте медиатеку и разделы с фотографиями.'}</p></div>`}<div class="help-box"><strong>Подсказка.</strong> Тексты внутри одного заголовка могут быть разделены на несколько полей, чтобы сохранить выделение цветом. Контакты и логотипы меняются в разделе «Компания и контакты».</div></div></div>`;
}
function contacts() {
  const fs=fieldsFor('global');
  return `<div class="contact-grid"><div><div class="panel"><h2>Основная информация</h2><p class="panel-note">Телефон, почта и подпись меняются во всех местах сайта одновременно.</p><div class="fields">${fs.filter(f=>f.type!=='image').map(fieldHtml).join('')}</div></div><div class="panel info-card"><h2>Логотипы компании</h2><p class="panel-note">Два варианта для светлого и тёмного фона. Для замены подойдёт PNG или WebP с прозрачным фоном.</p><div class="photo-fields fields">${fs.filter(f=>f.type==='image').map(photoField).join('')}</div></div></div><aside class="contact-preview"><div class="eyebrow-admin">ОБЩИЕ ДАННЫЕ САЙТА</div><img src="${e(values['global.logo_dark'])}" alt="${e(values['global.company'])}"><p class="preview-subtitle">${e(values['global.subtitle'])}</p><h3>${e(values['global.phone'])}</h3><p>${e(values['global.email'])}</p><p>${e(values['global.hours'])}</p><p>${e(values['global.region'])}</p><div class="sidebar-divider"></div><p>После публикации эти данные появятся в шапке, подвале и на странице контактов.</p></aside></div>`;
}
function mediaCard(m, selectField) {
  return `<${selectField?'button':'div'} class="media-card${selectField?' media-select':''}" ${selectField?`data-pick-image="${e(m.url)}" data-target-field="${selectField}"`:''}><img src="${e(m.url)}" alt="${e(m.name)}" loading="lazy"><div class="media-body"><div class="media-name">${e(m.name)}</div><small>${m.width?`${m.width} × ${m.height} · `:''}${Math.round(m.bytes/1024)} КБ${m.uploaded?' · загружено':''}</small></div></${selectField?'button':'div'}>`;
}
function library() {
  const filtered=media.filter(m=>m.name.toLowerCase().includes(search.toLowerCase()));
  return `<div class="upload-area" id="dropzone"><div><h3>Перетащите сюда фотографии</h3><p>JPG, PNG или WebP до 8 МБ. Большие фото оптимизируются для быстрой загрузки сайта.</p></div><button class="button" data-upload>${icon('upload')} Выбрать файлы</button></div><div class="search-wrap media-search">${icon('seo')}<input id="media-search" placeholder="Поиск по имени файла…" value="${e(search)}"></div><div class="media-grid">${filtered.map(m=>mediaCard(m)).join('')}</div><div class="help-box">Чтобы поставить фотографию на сайт, откройте нужную страницу → «Фотографии» → «Заменить фото». Загрузка в медиатеку сама по себе не меняет опубликованную страницу.</div>`;
}
function versions() {
  return `<div class="info-card"><div class="section-title"><h3>Текущая опубликованная версия</h3><span class="dot"></span></div><p class="panel-note">${e(date(serverState.publishedAt))} · ${unpublished().length} изменений в черновике</p></div><div class="section-title"><h2>Предыдущие версии</h2><small>Последние 50</small></div>${history.length?`<div class="history-list">${history.map(v=>`<div class="history-row"><div class="history-info"><span class="history-icon">${icon('history')}</span><div><p>${e(date(v.at))}</p><small>${e(v.action)} · ${e(v.author)}</small></div></div><button class="button small" data-restore="${v.id}">${icon('history')} Восстановить</button></div>`).join('')}</div>`:`<div class="empty">${icon('history')}<h3>История начнётся с первой публикации</h3><p>Текущая версия сайта будет сохранена перед обновлением.</p></div>`}`;
}
function settings() {
  return `<div class="panel password-panel"><h2>Сменить пароль</h2><p class="panel-note">Используйте минимум 12 символов. После смены пароля остальные сеансы будут завершены.</p><form class="password-form" id="password-form"><div><label class="field-label" for="account-current">Текущий пароль</label><input id="account-current" name="current" type="password" autocomplete="current-password" required></div><div><label class="field-label" for="account-new">Новый пароль</label><input id="account-new" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div><div><label class="field-label" for="account-repeat">Повторите новый пароль</label><input id="account-repeat" name="repeat" type="password" autocomplete="new-password" minlength="12" required></div><button class="button primary" type="submit">${icon('lock')} Сохранить новый пароль</button></form></div>`;
}
async function changePassword(event) {
  event.preventDefault();const form=event.currentTarget, data=Object.fromEntries(new FormData(form));
  if(data.password!==data.repeat)return toast('Пароли не совпадают.',true);
  const btn=form.querySelector('button');btn.disabled=true;
  try{await api('password',data);form.reset();toast('Пароль изменён.');}catch(err){toast(err.message,true);}finally{btn.disabled=false;}
}
function onInput(event) {
  const el=event.target;
  if(el.dataset.field){values[el.dataset.field]=el.type==='checkbox'?(el.checked?'1':'0'):el.value;updateToolbar();}
  if(el.id==='field-search'||el.id==='media-search') {
    search=el.value; const pos=el.selectionStart; render();const next=document.getElementById(el.id);next.focus();next.setSelectionRange(pos,pos);
  }
}
async function onClick(event) {
  const el=event.target.closest('button,[data-close-menu]');if(!el)return;
  if(busy)return;
  try {
    if(el.hasAttribute('data-mobile-menu'))document.querySelector('.shell').classList.toggle('menu-expanded');
    if(el.hasAttribute('data-close-menu'))document.querySelector('.shell').classList.remove('menu-expanded');
    if(el.dataset.route){route=el.dataset.route;search='';document.querySelector('.shell').classList.remove('menu-expanded');render();}
    if(el.dataset.editPage){page=el.dataset.editPage;route='pages';editorTab='texts';search='';render();}
    if(el.dataset.page){page=el.dataset.page;search='';render();}
    if(el.dataset.tab){editorTab=el.dataset.tab;search='';render();}
    if(el.hasAttribute('data-save'))await save();
    if(el.hasAttribute('data-preview'))await preview();
    if(el.hasAttribute('data-publish'))await publish();
    if(el.dataset.selectImage)selectImage(el.dataset.selectImage);
    if(el.hasAttribute('data-upload'))chooseFiles();
    if(el.dataset.uploadField)chooseFiles(el.dataset.uploadField);
    if(el.dataset.restore)await restore(el.dataset.restore);
    if(el.hasAttribute('data-logout')) { if(dirty&&!await confirmModal('Есть несохранённые изменения','Выйти без сохранения? Черновик, который уже сохранён на сервере, останется доступен.','Выйти'))return;await api('logout',{});dirty=false;login(); }
  } catch(err){toast(err.message,true);}
}
async function save(silent=false) {
  if(busy)return false;
  const keys=changed();if(!keys.length){if(!silent)toast('Все изменения уже сохранены.');return true;}
  busy=true;updateToolbar();
  try {
    const changes=Object.fromEntries(keys.map(k=>[k,values[k]]));const result=await api('save',{revision:serverState.revision,changes});
    // Preserve edits entered during the request.
    serverState=result.state;history=result.history;
    if(!silent)toast('Черновик сохранён. Изменения ещё не опубликованы.');return true;
  }finally{busy=false;updateToolbar();}
}
function closeModal(){modalRoot.innerHTML='';document.body.classList.remove('modal-open');}
function openModal(html){document.body.classList.add('modal-open');modalRoot.innerHTML=`<div class="modal-overlay">${html}</div>`;modalRoot.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));}
function confirmModal(title,description,buttonText='Продолжить') {
  return new Promise(resolve=>{
    openModal(`<section class="admin-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div class="modal-head"><h2 id="confirm-title">${e(title)}</h2><button class="close-btn" id="cancel-x" aria-label="Закрыть">${icon('close')}</button></div><div class="modal-body"><p>${e(description)}</p></div><div class="modal-footer"><button class="button" id="cancel-confirm">Отмена</button><button class="button primary" id="accept-confirm">${e(buttonText)}</button></div></section>`);
    const finish=ok=>{closeModal();resolve(ok);};document.getElementById('cancel-x').onclick=()=>finish(false);document.getElementById('cancel-confirm').onclick=()=>finish(false);document.getElementById('accept-confirm').onclick=()=>finish(true);
  });
}
async function publish() {
  if(busy)return; const count=unpublished().length;
  if(!count)return toast('Опубликованная версия уже совпадает с черновиком.');
  const affected=new Set(unpublished().map(k=>schema.fields[k]?.page).filter(Boolean));
  if(!await confirmModal('Опубликовать изменения?',`${count} изменённых полей ${affected.has('global')?'на всех страницах':`на ${affected.size} страницах`} появятся на боевом сайте. Предыдущая версия автоматически сохранится в истории.`,'Опубликовать'))return;
  await save(true);busy=true;updateToolbar();
  try{const result=await api('publish',{revision:serverState.revision});serverState=result.state;values={...serverState.draft};history=result.history;render();toast('Новая версия опубликована на gvs-group.ru.');}finally{busy=false;updateToolbar();}
}
async function restore(id) {
  if(!await confirmModal('Восстановить предыдущую версию?','Содержание сайта и черновик заменятся выбранной версией. Текущая опубликованная версия сохранится в истории.','Восстановить'))return;
  busy=true;updateToolbar();try{const result=await api('restore',{id,revision:serverState.revision});serverState=result.state;values={...serverState.draft};history=result.history;render();toast('Выбранная версия восстановлена и опубликована.');}finally{busy=false;updateToolbar();}
}
async function preview() {
  await save(true);
  openModal(`<section class="admin-modal preview-modal" role="dialog" aria-modal="true" aria-label="Предпросмотр черновика"><div class="modal-head"><h2>${e(schema.pages[page].name)} · Черновик</h2><div class="preview-tools"><button class="button small active" data-device="desktop">${icon('pages')}<span>Компьютер</span></button><button class="button small" data-device="mobile">${icon('contacts')}<span>Телефон</span></button></div><button class="close-btn" data-close-modal aria-label="Закрыть">${icon('close')}</button></div><div class="preview-frame-wrap"><iframe class="preview-frame" title="Предпросмотр страницы" src="/admin/preview.php?page=${page}&revision=${serverState.revision}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe></div></section>`);
  modalRoot.querySelectorAll('[data-device]').forEach(b=>b.addEventListener('click',()=>{modalRoot.querySelector('.preview-frame').classList.toggle('mobile',b.dataset.device==='mobile');modalRoot.querySelectorAll('[data-device]').forEach(n=>n.classList.toggle('active',n===b));}));
}
function selectImage(field) {
  openModal(`<section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="media-title"><div class="modal-head"><h2 id="media-title">Выберите фотографию</h2><button class="button small" id="modal-upload">${icon('upload')} Загрузить новую</button><button class="close-btn" data-close-modal aria-label="Закрыть">${icon('close')}</button></div><div class="modal-body"><p class="panel-note">${e(schema.fields[field].label)} · ${e(schema.fields[field].section)}</p><div class="media-grid">${media.map(m=>mediaCard(m,field)).join('')}</div></div></section>`);
  document.getElementById('modal-upload').onclick=()=>chooseFiles(field);
  modalRoot.querySelectorAll('[data-pick-image]').forEach(b=>b.addEventListener('click',()=>{values[field]=b.dataset.pickImage;closeModal();render();toast('Фото заменено в черновике.');}));
}
function chooseFiles(field) {
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=!field;
  input.onchange=()=>uploadFiles([...input.files],field);input.click();
}
async function uploadFiles(files,field) {
  if(!files.length)return;
  let last, count=0;
  for(const file of files) {
    if(file.size>8*1024*1024){toast(`${file.name}: файл больше 8 МБ.`,true);continue;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Можно загрузить JPG, PNG или WebP.',true);continue;}
    try{toast(`Загружаем ${file.name}…`);const data=new FormData();data.append('image',file);const result=await api('upload',data,true);media=result.media;last=result.url;count++;}
    catch(err){toast(err.message,true);return;}
  }
  if(field&&last){values[field]=last;closeModal();}render();if(count)toast(field?'Новая фотография добавлена в черновик.':`Загружено фотографий: ${count}.`);
}
function bindDropzone() {
  const dz=document.getElementById('dropzone');
  dz.addEventListener('dragover',event=>{event.preventDefault();dz.classList.add('dragging');});
  dz.addEventListener('dragleave',()=>dz.classList.remove('dragging'));
  dz.addEventListener('drop',event=>{event.preventDefault();dz.classList.remove('dragging');uploadFiles([...event.dataTransfer.files]);});
}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
(async()=>{try{const session=await api('session');csrf=session.csrf;if(!session.authenticated)login();else if(session.mustChange)login(true);else await load();}catch(err){app.innerHTML=`<div class="initial-loading"><span class="loading-mark">GVS</span><p>${e(err.message)}</p><button class="button" id="retry">Попробовать ещё раз</button></div>`;document.getElementById('retry').onclick=()=>location.reload();}})();
