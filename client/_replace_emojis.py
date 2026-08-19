import re, os

# Map of (file, old_string) -> new_string replacements
# For HTML files: inline SVG wrapped in span.ci
# For JS files: icon() calls
# For WhatsApp messages (wa.me, WA API): KEEP emojis

def svg(name):
    """Return inline SVG span for HTML context"""
    svgs = {
        'heartFilled': '<span class="ci ci--teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></span>',
        'handshake': '<span class="ci ci--xl ci--teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg></span>',
        'sparkles': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg></span>',
        'mapPin': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>',
        'clock': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>',
        'check': '<span class="ci ci--success"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>',
        'checkCircle': '<span class="ci ci--success"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span>',
        'dollarSign': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>',
        'lock': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>',
        'lockLg': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>',
        'bookOpen': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>',
        'zap': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></span>',
        'shieldCheck': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg></span>',
        'send': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></span>',
        'camera': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></span>',
        'hourglass': '<span class="ci ci--xl ci--warning"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg></span>',
        'alertCircle': '<span class="ci ci--xl ci--muted"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></span>',
        'refreshCw': '<span class="ci ci--xl ci--teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg></span>',
        'baby': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></svg></span>',
        'user': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>',
        'home': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>',
        'utensils': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg></span>',
        'phone': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg></span>',
        'clipboardList': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg></span>',
        'partyPopper': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg></span>',
        'lightbulb': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg></span>',
        'penLine': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>',
        'notebook': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/></svg></span>',
        'eye': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg></span>',
        'starFilled': '<span class="ci ci--gold"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>',
        'scanFace': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg></span>',
        'timer': '<span class="ci"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg></span>',
        'xCircle': '<span class="ci ci--danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span>',
        'mail': '<span class="ci ci--xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>',
    }
    return svgs.get(name, f'[{name}]')

replacements = [
    # === invita-cuidador.html (remaining 10) ===
    ('invita-cuidador.html', '🌟</div>', f'{svg("sparkles")}</div>'),
    ('invita-cuidador.html', '📍</div>', f'{svg("mapPin")}</div>'),
    ('invita-cuidador.html', '🕐</div>', f'{svg("clock")}</div>'),
    ('invita-cuidador.html', '>✓</div>', f'>{svg("check")}</div>'),
    ('invita-cuidador.html', '💰</div>', f'{svg("dollarSign")}</div>'),
    ('invita-cuidador.html', '🔒</div>', f'{svg("lockLg")}</div>'),
    ('invita-cuidador.html', '📚</div>', f'{svg("bookOpen")}</div>'),
    ('invita-cuidador.html', '⚡ Menos de 1 minuto', f'{svg("zap")} Menos de 1 minuto'),
    ('invita-cuidador.html', '🔐 Datos protegidos', f'{svg("shieldCheck")} Datos protegidos'),

    # === verificar-identidad.html (6) ===
    ('verificar-identidad.html', '>✅</div>', f'>{svg("checkCircle")}</div>'),
    ('verificar-identidad.html', '>⏳</div>', f'>{svg("hourglass")}</div>'),
    ('verificar-identidad.html', '🤳</div>', f'{svg("scanFace")}</div>'),
    ('verificar-identidad.html', '<strong>🔒 Tu privacidad', f'<strong>{svg("lock")} Tu privacidad'),
    ('verificar-identidad.html', '>📨</div>', f'>{svg("send")}</div>'),
    # line with ✅ has style attribute - let's handle the exact context
    
    # === cuidador-enviado.html (5, skip WA msg with 💙) ===
    ('cuidador-enviado.html', '>📨</div>', f'>{svg("send")}</div>'),
    ('cuidador-enviado.html', 'Registro enviado ✓', f'Registro enviado {svg("check")}'),
    ('cuidador-enviado.html', '>💡 Mientras tanto', f'>{svg("lightbulb")} Mientras tanto'),
    ('cuidador-enviado.html', '>🌟 ¿Conocés familias', f'>{svg("sparkles")} ¿Conocés familias'),
    # 💙 in WA message - KEEP
    
    # === completar-perfil.html (4) ===
    ('completar-perfil.html', '>🔒</div>', f'>{svg("lockLg")}</div>'),
    ('completar-perfil.html', '>✓</span>', f'>{svg("check")}</span>'),
    ('completar-perfil.html', '>📞 Qué hacemos', f'>{svg("phone")} Qué hacemos'),
    ('completar-perfil.html', '>📋 Próximos pasos', f'>{svg("clipboardList")} Próximos pasos'),

    # === registro-cuidador.html (12) ===
    ('registro-cuidador.html', '>👤 ¿Quién te recomendó?', f'>{svg("user")} ¿Quién te recomendó?'),
    ('registro-cuidador.html', '>📋 ¿Cómo se mantiene?', f'>{svg("clipboardList")} ¿Cómo se mantiene?'),
    ('registro-cuidador.html', '>👶</span>', f'>{svg("baby")}</span>'),
    ('registro-cuidador.html', '>🧓</span>', f'>{svg("user")}</span>'),
    ('registro-cuidador.html', '>🏠</span>', f'>{svg("home")}</span>'),
    ('registro-cuidador.html', '>🍳</span>', f'>{svg("utensils")}</span>'),
    ('registro-cuidador.html', '🤳</div>', f'{svg("scanFace")}</div>'),
    ('registro-cuidador.html', '<strong>🔒 Tu privacidad', f'<strong>{svg("lock")} Tu privacidad'),
    ('registro-cuidador.html', '>📋 ¿Qué pasa después?', f'>{svg("clipboardList")} ¿Qué pasa después?'),
    ('registro-cuidador.html', '>⏱️ ¿Cuánto tarda?', f'>{svg("timer")} ¿Cuánto tarda?'),
    ('registro-cuidador.html', '>🎉</div>', f'>{svg("partyPopper")}</div>'),

    # === diario-cuidador.html (4) ===
    ('diario-cuidador.html', '>📍</span>', f'>{svg("mapPin")}</span>'),
    ('diario-cuidador.html', '>📷 Foto</button>', f'>{svg("camera")} Foto</button>'),
    ('diario-cuidador.html', '<span>✏️</span>', f'<span>{svg("penLine")}</span>'),
    ('diario-cuidador.html', '>🌟</span>', f'>{svg("sparkles")}</span>'),
    
    # === diario-familia.html (1) ===
    ('diario-familia.html', '>💌</span>', f'>{svg("mail")}</span>'),

    # === panel-cuidador.html (4) ===
    ('panel-cuidador.html', '>📨</span>', f'>{svg("send")}</span>'),
    ('panel-cuidador.html', '>👤</span>', f'>{svg("user")}</span>'),
    ('panel-cuidador.html', '>📓</span>', f'>{svg("notebook")}</span>'),
    ('panel-cuidador.html', '>👁</span>', f'>{svg("eye")}</span>'),

    # === admin/index.html (5 ★ in option values) ===
    ('admin/index.html', '>★ 5</option>', f'>{svg("starFilled")} 5</option>'),
    ('admin/index.html', '>★ 4 o más</option>', f'>{svg("starFilled")} 4 o más</option>'),
    ('admin/index.html', '>★ 3 o más</option>', f'>{svg("starFilled")} 3 o más</option>'),
    ('admin/index.html', '>★ 2 o más</option>', f'>{svg("starFilled")} 2 o más</option>'),
    ('admin/index.html', '>★ 1 o más</option>', f'>{svg("starFilled")} 1 o más</option>'),

    # === reactivar.html (1) ===
    ('reactivar.html', '>🔄</div>', f'>{svg("refreshCw")}</div>'),

    # === pago-exitoso.html (1) ===
    ('pago-exitoso.html', '>✅</div>', f'>{svg("checkCircle")}</div>'),

    # === pago-fallido.html (1) ===
    ('pago-fallido.html', '>😕</div>', f'>{svg("alertCircle")}</div>'),

    # === pago-pendiente.html (1) ===
    ('pago-pendiente.html', '>⏳</div>', f'>{svg("hourglass")}</div>'),

    # === auth-callback.html (1) ===
    ('auth-callback.html', '>😕</p>', f'>{svg("alertCircle")}</p>'),
]

# JS files - these use icon() function calls
js_replacements = [
    # === diario-familia.js (3) ===
    ('diario-familia.js', "mensajeSent.textContent = '✓ Mensaje enviado'", "mensajeSent.innerHTML = icon('check', 'success') + ' Mensaje enviado'"),
    ('diario-familia.js', "estadoHtml = `<span class=\"msg-enviado__estado msg-enviado__estado--leido\">✓✓ Leído", "estadoHtml = `<span class=\"msg-enviado__estado msg-enviado__estado--leido\">${icon('checkCheck', 'success')} Leído"),
    ('diario-familia.js', "estadoHtml = '<span class=\"msg-enviado__estado msg-enviado__estado--pendiente\">✓ Enviado · sin leer</span>'", "estadoHtml = `<span class=\"msg-enviado__estado msg-enviado__estado--pendiente\">${icon('check', 'muted')} Enviado · sin leer</span>`"),

    # === diario-cuidador.js (3) ===
    ('diario-cuidador.js', "Leído ✓</button>", "${icon('check', 'success')} Leído</button>"),
    ('diario-cuidador.js', "btn.textContent = '✓'", "btn.innerHTML = icon('check', 'success')"),
    ('diario-cuidador.js', "btn.textContent = 'Leído ✓'", "btn.innerHTML = icon('check', 'success') + ' Leído'"),

    # === completar-perfil.js (1) ===
    ('completar-perfil.js', "status.textContent = 'Borrador guardado ✓'", "status.innerHTML = icon('check', 'success') + ' Borrador guardado'"),

    # === panel-cuidador.js (1) ===
    ('panel-cuidador.js', "msg.textContent = '✓ Datos actualizados correctamente'", "msg.innerHTML = icon('check', 'success') + ' Datos actualizados correctamente'"),

    # === js/otp-whatsapp.js (2) ===
    ('js/otp-whatsapp.js', "otpStatus.textContent = '✓ WhatsApp verificado'", "otpStatus.innerHTML = icon('check', 'success') + ' WhatsApp verificado'"),
    ('js/otp-whatsapp.js', "btn.textContent = '✓ Verificado'", "btn.innerHTML = icon('check', 'success') + ' Verificado'"),

    # === admin/admin.js (1) ===
    ('admin/admin.js', 'return `<span class="rating">★ ${v.toFixed(1)}</span>', 'return `<span class="rating">${icon("starFilled", "gold")} ${v.toFixed(1)}</span>'),

    # === admin/candidatura.html (1, inside script) ===
    ('admin/candidatura.html', "'✗ Rechazar'", "icon('xCircle', 'danger') + ' Rechazar'"),
]

# CSS replacements
css_replacements = [
    ('style.css', '.doc-card.is-loaded .doc-card__drop::before { content: "✓ "; }', '.doc-card.is-loaded .doc-card__drop::before { content: "\\2713  "; }'),
]

# NOTE: Skip WA messages in:
# cuidador-enviado.html line 100 (💙 in WhatsApp share msg)
# js/invita.js lines 81,83 (💙 in WA messages)

basedir = '/sessions/gracious-vigilant-carson/mnt/QQMC/client/'
count = 0
errors = []

for fname, old, new in replacements + js_replacements + css_replacements:
    fpath = os.path.join(basedir, fname)
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        if old not in content:
            errors.append(f"NOT FOUND in {fname}: {repr(old[:60])}")
            continue
        content = content.replace(old, new, 1)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1
    except Exception as e:
        errors.append(f"ERROR {fname}: {e}")

print(f"Replaced: {count}")
if errors:
    print("Issues:")
    for e in errors:
        print(f"  {e}")
