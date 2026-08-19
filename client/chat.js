/* =============================================================
   QQMC — Asistente de búsqueda conversacional
   "Caro" — personalidad empática, cercana, contenedora.
   Flujo guiado con inteligencia emocional.
   Preparado para enchufar LLM en el futuro sin cambiar UI.
   ============================================================= */
(() => {
  const API_BASE = '/.netlify/functions/api';

  const ESPECIALIDAD_LABEL = {
    ninera: 'Niñera',
    adulto_mayor: 'Cuidado lúdico de adulto mayor',
    cocinera: 'Cocinera',
    domestica: 'Empleada doméstica'
  };

  const COLORS = {
    ninera: '#ec4899',
    adulto_mayor: '#0ea5e9',
    cocinera: '#f59e0b',
    domestica: '#10b981'
  };

  // ---- Estado del chat ----
  let step = 'welcome';
  const answers = {};
  let cuidadoresActuales = [];

  // ---- DOM ----
  const chatMessages = document.getElementById('chatMessages');
  const chatOptions  = document.getElementById('chatOptions');
  const chatForm     = document.getElementById('chatForm');
  const chatInput    = document.getElementById('chatInput');
  const resultsPane  = document.getElementById('assistantResults');
  const resultsList  = document.getElementById('resultsList');

  // ---- Flujo conversacional ----
  const FLOW = {

    welcome: {
      bot: [
        'Hola, soy Caro, del equipo de Cuidy.',
        'Estoy acá para ayudarte a encontrar a la persona indicada para tu hogar. Contame, ¿qué tipo de ayuda estás buscando?'
      ],
      options: [
        { label: 'Necesito una niñera', value: 'ninera', icon: icon('baby') },
        { label: 'Cuidado lúdico de adulto mayor', value: 'adulto_mayor', icon: icon('heart') },
        { label: 'Cocinera', value: 'cocinera', icon: icon('utensils') },
        { label: 'Empleada doméstica', value: 'domestica', icon: icon('home') }
      ],
      field: 'tipo',
      next: () => 'contexto'
    },

    // --- Cuando no sabe qué necesita ---
    no_sabe: {
      bot: () => [
        'No te preocupes, es normal no tener claro qué tipo de ayuda buscar.',
        'A veces las necesidades del hogar se mezclan y es difícil ponerles nombre. Contame un poquito: ¿qué es lo que más te está costando resolver en el día a día?'
      ],
      input: true,
      placeholder: 'Contame lo que necesitás…',
      field: 'contexto_libre',
      next: 'orientacion'
    },

    orientacion: {
      bot: (a) => [
        'Gracias por contarme. Con lo que me decís, te sugiero que veamos todas las opciones disponibles y después las vamos filtrando juntas.',
        '¿En qué barrio o zona necesitás la ayuda?'
      ],
      input: true,
      placeholder: 'Ej: Palermo, Belgrano, San Isidro…',
      field: 'zona',
      next: 'ubicacion'
    },

    // --- Contexto según tipo de cuidado ---
    contexto: {
      bot: (a) => {
        if (a.tipo === 'ninera') {
          return [
            'Entiendo, buscar a alguien para que cuide a tus hijos es una de las decisiones más importantes. Quiero ayudarte a encontrar a la persona justa.',
            '¿Querés contarme un poco sobre tu situación para que pueda recomendarte mejor?'
          ];
        }
        if (a.tipo === 'adulto_mayor') {
          return [
            'Sé que buscar ayuda para un ser querido mayor no es fácil. Es un paso importante y quiero acompañarte en la búsqueda.',
            '¿Querés contarme un poco sobre la situación para que pueda orientarte mejor?'
          ];
        }
        if (a.tipo === 'cocinera') {
          return [
            'Tener a alguien que cocine rico y de confianza hace una gran diferencia en el día a día.',
            '¿Querés contarme un poco más sobre lo que necesitás para buscar la persona ideal?'
          ];
        }
        return [
          'Perfecto. Encontrar a alguien de confianza para tu hogar es clave para la tranquilidad de toda la familia.',
          '¿Querés contarme un poco sobre lo que necesitás para darte mejores opciones?'
        ];
      },
      options: [
        { label: 'Sí, quiero contarte', value: 'si', icon: icon('messageCircle') },
        { label: 'Prefiero ir directo a buscar', value: 'no', icon: icon('search') }
      ],
      field: '_quiere_contexto',
      next: (a) => a._quiere_contexto === 'si' ? 'detalle_' + a.tipo : 'zona'
    },

    // --- Detalle para niñera ---
    detalle_ninera: {
      bot: () => [
        '¿Cuántos años tienen tus hijos? Así busco a alguien con experiencia en esa franja de edad.'
      ],
      input: true,
      placeholder: 'Ej: 2 y 5 años, un bebé de 8 meses…',
      field: 'detalle_hijos',
      next: 'necesidad_ninera'
    },

    necesidad_ninera: {
      bot: () => [
        'Gracias. ¿Hay algo en particular que sea importante para vos?'
      ],
      options: [
        { label: 'Que tenga experiencia con bebés', value: 'bebes', icon: icon('baby') },
        { label: 'Que pueda ayudar con tareas escolares', value: 'escolar', icon: icon('bookOpen') },
        { label: 'Que sepa primeros auxilios', value: 'auxilios', icon: icon('pill') },
        { label: 'Nada en especial, busco alguien confiable', value: 'general', icon: icon('heart') }
      ],
      field: 'necesidad_especial',
      next: 'transicion_zona'
    },

    // --- Detalle para adulto mayor ---
    detalle_adulto_mayor: {
      bot: () => [
        '¿Podrías contarme brevemente la situación de tu familiar? Por ejemplo: si necesita asistencia para moverse, si tiene alguna condición particular, o si principalmente buscás compañía.'
      ],
      input: true,
      placeholder: 'Contame sobre tu familiar…',
      field: 'detalle_adulto',
      next: 'necesidad_adulto'
    },

    necesidad_adulto: {
      bot: () => [
        'Entiendo perfectamente. ¿Qué es lo más importante para vos en la persona que lo/la cuide?'
      ],
      options: [
        { label: 'Experiencia con medicación', value: 'medicacion', icon: icon('pill') },
        { label: 'Paciencia y compañía', value: 'compania', icon: icon('heart') },
        { label: 'Formación en enfermería', value: 'enfermeria', icon: icon('pill') },
        { label: 'Que pueda hacer turnos nocturnos', value: 'nocturno', icon: icon('moon') }
      ],
      field: 'necesidad_especial',
      next: 'transicion_zona'
    },

    // --- Detalle para doméstica ---
    detalle_domestica: {
      bot: () => [
        '¿Qué tareas necesitás que cubra? Así busco a alguien que se ajuste a lo que tu hogar necesita.'
      ],
      options: [
        { label: 'Limpieza y orden general', value: 'limpieza', icon: icon('home') },
        { label: 'Limpieza y cocina', value: 'cocina', icon: icon('utensils') },
        { label: 'Todo: limpieza, cocina y planchado', value: 'integral', icon: icon('sparkles') },
        { label: 'Cuidado del hogar + niños', value: 'hogar_ninos', icon: icon('baby') + icon('home') }
      ],
      field: 'necesidad_especial',
      next: 'transicion_zona'
    },

    // --- Detalle para cocinera ---
    detalle_cocinera: {
      bot: () => [
        '¿Qué tipo de cocina necesitás que prepare?'
      ],
      options: [
        { label: 'Cocina casera del día a día', value: 'casera', icon: icon('utensils') },
        { label: 'Viandas o meal prep semanal', value: 'viandas', icon: icon('utensils') },
        { label: 'Cocina saludable o con dieta especial', value: 'saludable', icon: icon('utensils') },
        { label: 'Cocina completa + limpieza de cocina', value: 'integral', icon: icon('sparkles') }
      ],
      field: 'necesidad_especial',
      next: 'transicion_zona'
    },

    // --- Transición hacia la búsqueda (con contención) ---
    transicion_zona: {
      bot: (a) => {
        const frases = {
          ninera: 'Perfecto, voy a buscar a alguien que sea ideal para tus chicos.',
          adulto_mayor: 'Voy a buscar a alguien que pueda darle la atención que merece tu familiar.',
          cocinera: 'Entendido. Voy a buscar a la cocinera ideal para tu hogar.',
          domestica: 'Entendido. Voy a buscar a alguien que se ajuste a las necesidades de tu hogar.'
        };
        return [
          frases[a.tipo] || 'Perfecto, vamos a encontrar a la persona indicada.',
          '¿En qué barrio o zona necesitás el servicio?'
        ];
      },
      input: true,
      placeholder: 'Ej: Palermo, Belgrano, San Isidro…',
      field: 'zona',
      next: 'ubicacion'
    },

    zona: {
      bot: () => [
        '¿En qué barrio o zona necesitás el servicio?'
      ],
      input: true,
      placeholder: 'Ej: Palermo, Belgrano, San Isidro…',
      field: 'zona',
      next: 'ubicacion'
    },

    ubicacion: {
      bot: (a) => [
        '¿Querés que busquemos cerca de tu ubicación actual? Así te muestro primero a quienes están más cerca tuyo.'
      ],
      options: [
        { label: 'Sí, usar mi ubicación', value: 'geolocate', icon: icon('mapPin') },
        { label: 'No, buscar en toda la zona', value: 'skip', icon: icon('globe') }
      ],
      field: '_ubicacion',
      next: (a) => a._ubicacion === 'geolocate' ? 'geolocating' : 'dias'
    },

    geolocating: {
      bot: () => ['Dame un segundito, estoy obteniendo tu ubicación…'],
      action: 'geolocate'
    },

    distancia: {
      bot: () => ['¿Hasta qué distancia máxima te gustaría buscar?'],
      options: [
        { label: 'Cerca, hasta 3 km', value: '3', icon: icon('footprints') },
        { label: 'Hasta 5 km', value: '5', icon: icon('bike') },
        { label: 'Hasta 10 km', value: '10', icon: icon('car') },
        { label: 'Hasta 20 km, no me importa viajar', value: '20', icon: icon('bus') }
      ],
      field: 'distancia_km',
      next: 'dias'
    },

    dias: {
      bot: (a) => {
        const mensajes = {
          ninera: '¿Qué días necesitás que cuide a tus hijos?',
          adulto_mayor: '¿Qué días necesitás la asistencia?',
          cocinera: '¿Qué días necesitás que cocine?',
          domestica: '¿Qué días necesitás ayuda en tu hogar?'
        };
        return [mensajes[a.tipo] || '¿Qué días de la semana necesitás el servicio?'];
      },
      options: [
        { label: 'Lunes a viernes', value: 'lun,mar,mie,jue,vie', icon: icon('calendar') },
        { label: 'Solo fines de semana', value: 'sab,dom', icon: icon('calendar') },
        { label: 'Toda la semana', value: 'lun,mar,mie,jue,vie,sab,dom', icon: icon('calendarDays') },
        { label: 'Algunos días puntuales', value: '_custom', icon: icon('penLine') }
      ],
      field: 'dias',
      next: (a) => a.dias === '_custom' ? 'dias_custom' : 'franja'
    },

    dias_custom: {
      bot: () => ['Seleccioná los días que necesitás:'],
      multiOptions: [
        { label: 'Lun', value: 'lun' },
        { label: 'Mar', value: 'mar' },
        { label: 'Mié', value: 'mie' },
        { label: 'Jue', value: 'jue' },
        { label: 'Vie', value: 'vie' },
        { label: 'Sáb', value: 'sab' },
        { label: 'Dom', value: 'dom' }
      ],
      field: 'dias',
      next: 'franja'
    },

    franja: {
      bot: () => ['¿Y en qué horario lo necesitás?'],
      options: [
        { label: 'Por la mañana (6 a 13hs)', value: 'manana', icon: icon('sunrise') },
        { label: 'Por la tarde (13 a 21hs)', value: 'tarde', icon: icon('sun') },
        { label: 'Por la noche (21 a 6hs)', value: 'noche', icon: icon('moon') },
        { label: 'Jornada completa', value: '', icon: icon('clock') }
      ],
      field: 'franja',
      next: 'experiencia'
    },

    experiencia: {
      bot: (a) => {
        if (a.tipo === 'adulto_mayor') {
          return ['La experiencia es muy importante en el cuidado de adultos mayores. ¿Cuánta experiencia mínima te gustaría que tenga?'];
        }
        return ['¿Te importa la experiencia previa de la persona?'];
      },
      options: [
        { label: 'No me importa, valoro la actitud', value: '0', icon: icon('heart') },
        { label: 'Al menos 1 año', value: '1', icon: icon('starFilled', 'gold') },
        { label: 'Al menos 3 años', value: '3', icon: icon('starFilled', 'gold') + icon('starFilled', 'gold') },
        { label: '5 años o más', value: '5', icon: icon('starFilled', 'gold') + icon('starFilled', 'gold') + icon('starFilled', 'gold') }
      ],
      field: 'experiencia_min',
      next: 'verificado'
    },

    verificado: {
      bot: () => [
        '¿Querés ver solo personas con perfil verificado? Esto significa que revisamos su documentación, hicimos una entrevista y chequeamos sus antecedentes.'
      ],
      options: [
        { label: 'Sí, solo verificados', value: '1', icon: icon('checkCircle', 'success') },
        { label: 'Ver todos los perfiles', value: '0', icon: icon('eye') }
      ],
      field: 'verificado',
      next: 'buscar'
    },

    buscar: {
      bot: (a) => {
        const frases = {
          ninera: 'Perfecto, ya tengo todo. Voy a buscar las mejores niñeras para tu familia…',
          adulto_mayor: 'Ya tengo toda la información. Voy a buscar a las personas más preparadas para cuidar a tu familiar…',
          cocinera: 'Listo, voy a buscar las mejores cocineras para tu hogar…',
          domestica: 'Listo, voy a buscar las mejores opciones para tu hogar…'
        };
        return [frases[a.tipo] || 'Buscando las mejores opciones para vos…'];
      },
      action: 'search'
    },

    sin_resultados: {
      bot: (a) => {
        const tipo = a.tipo || 'todos';
        if (tipo === 'adulto_mayor') {
          return [
            'No encontré cuidadores que coincidan con todos tus criterios, pero no te preocupes.',
            'El cuidado de un ser querido es muy importante y quiero ayudarte a encontrar opciones. ¿Querés que ampliemos la búsqueda?'
          ];
        }
        return [
          'No encontré resultados exactos para lo que buscás, pero no te desanimes.',
          '¿Querés que ampliemos un poco los criterios? A veces la persona ideal está un poquito más lejos o tiene un perfil diferente al esperado.'
        ];
      },
      options: [
        { label: 'Ver todos los cuidadores de la zona', value: 'ver_todos_zona', icon: icon('users') },
        { label: 'Ampliar la zona de búsqueda', value: 'ampliar_zona', icon: icon('globe') },
        { label: 'Flexibilizar la experiencia', value: 'ampliar_exp', icon: icon('unlock') },
        { label: 'Empezar de nuevo', value: 'reiniciar', icon: icon('refreshCw') }
      ],
      field: '_ampliar',
      next: (a) => a._ampliar === 'reiniciar' ? 'reset' : 'buscar_ampliado'
    },

    buscar_ampliado: {
      bot: (a) => {
        if (a._ampliar === 'ver_todos_zona') {
          return ['Dale, te muestro todos los cuidadores publicados en ' + (a.zona || 'tu zona') + ', sin filtros adicionales…'];
        }
        return ['Dale, busco con criterios más amplios…'];
      },
      action: 'search_wide'
    },

    resultados_ok: {
      bot: (a, count) => {
        const msgs = [];
        if (count === 1) {
          msgs.push('Encontré 1 persona que coincide con lo que buscás.');
        } else if (count <= 3) {
          msgs.push(`Encontré ${count} personas que coinciden con lo que me contaste.`);
        } else {
          msgs.push(`Encontré ${count} personas que podrían ser ideales para vos.`);
        }
        msgs.push('Hacé click en cualquier perfil para ver más detalles, su disponibilidad y su experiencia. Si alguna te interesa, podés guardarla en favoritos.');
        return msgs;
      },
      options: [
        { label: 'Ajustar la búsqueda', value: 'refinar', icon: icon('search') },
        { label: 'Empezar de nuevo', value: 'reiniciar', icon: icon('refreshCw') }
      ],
      field: '_post',
      next: (a) => a._post === 'reiniciar' ? 'reset' : 'refinar'
    },

    refinar: {
      bot: () => ['¿Qué te gustaría cambiar?'],
      options: [
        { label: 'La zona', value: 'zona', icon: icon('mapPin') },
        { label: 'Los días y horarios', value: 'dias', icon: icon('calendar') },
        { label: 'La experiencia requerida', value: 'experiencia', icon: icon('starFilled', 'gold') },
        { label: 'Empezar todo de nuevo', value: 'reset', icon: icon('refreshCw') }
      ],
      field: '_refinar',
      next: (a) => a._refinar
    },

    // ============================================================
    //  FLUJO EXPRESS — familia logueada con búsquedas previas
    // ============================================================

    express_welcome: {
      bot: (a) => {
        const busq = a._busqueda_previa;
        const tipoLabel = ESPECIALIDAD_LABEL[busq.tipo] || busq.tipo;
        const zona = busq.zona || '';
        return [
          `¡Hola ${a._nombre_familia}! Qué bueno verte de nuevo.`,
          `La última vez buscaste ${tipoLabel.toLowerCase()} en ${zona}. ¿Querés que busque con los mismos criterios o preferís cambiar algo?`
        ];
      },
      options: [
        { label: 'Buscar con los mismos criterios', value: 'mismo', icon: icon('search') },
        { label: 'Quiero cambiar algo', value: 'cambiar', icon: icon('penLine') },
        { label: 'Buscar algo completamente diferente', value: 'nuevo', icon: icon('refreshCw') }
      ],
      field: '_express_opcion',
      next: (a) => {
        if (a._express_opcion === 'mismo') {
          // Cargar las preferencias previas como answers
          const b = a._busqueda_previa;
          if (b.tipo) a.tipo = b.tipo;
          if (b.zona) a.zona = b.zona;
          if (b.dias) a.dias = b.dias;
          if (b.franja) a.franja = b.franja;
          if (b.experiencia_min) a.experiencia_min = b.experiencia_min;
          if (b.verificado) a.verificado = b.verificado;
          if (b.user_lat) { a.user_lat = b.user_lat; a.user_lng = b.user_lng; }
          if (b.distancia_km) a.distancia_km = b.distancia_km;
          return 'express_buscar';
        }
        if (a._express_opcion === 'cambiar') return 'express_que_cambiar';
        return 'reset';
      }
    },

    express_buscar: {
      bot: (a) => {
        const frases = {
          ninera: 'Perfecto, busco las mejores niñeras para vos con tus criterios anteriores…',
          adulto_mayor: 'Buscando cuidadores para tu familiar con los mismos criterios…',
          cocinera: 'Buscando cocineras con tus preferencias anteriores…',
          domestica: 'Buscando empleadas domésticas con tus preferencias…'
        };
        return [frases[a.tipo] || 'Buscando con tus criterios anteriores…'];
      },
      action: 'search'
    },

    express_que_cambiar: {
      bot: () => ['¿Qué te gustaría cambiar?'],
      options: [
        { label: 'El tipo de cuidado', value: 'welcome', icon: icon('user') },
        { label: 'La zona', value: 'transicion_zona', icon: icon('mapPin') },
        { label: 'Los días y horarios', value: 'dias', icon: icon('calendar') },
        { label: 'La experiencia requerida', value: 'experiencia', icon: icon('starFilled', 'gold') }
      ],
      field: '_express_cambiar',
      next: (a) => {
        // Cargar preferencias previas como base antes de cambiar
        const b = a._busqueda_previa;
        if (b.tipo) a.tipo = a.tipo || b.tipo;
        if (b.zona) a.zona = a.zona || b.zona;
        if (b.dias) a.dias = a.dias || b.dias;
        if (b.franja) a.franja = a.franja || b.franja;
        if (b.experiencia_min) a.experiencia_min = a.experiencia_min || b.experiencia_min;
        if (b.verificado) a.verificado = a.verificado || b.verificado;
        if (b.user_lat) { a.user_lat = a.user_lat || b.user_lat; a.user_lng = a.user_lng || b.user_lng; }
        if (b.distancia_km) a.distancia_km = a.distancia_km || b.distancia_km;
        return a._express_cambiar;
      }
    },

    // Familia logueada sin búsquedas previas
    express_new: {
      bot: (a) => [
        `¡Hola ${a._nombre_familia}! Bienvenida a Cuidy.`,
        'Soy Caro, y estoy acá para ayudarte a encontrar a la persona indicada para tu hogar. Contame, ¿qué tipo de ayuda estás buscando?'
      ],
      options: [
        { label: 'Necesito una niñera', value: 'ninera', icon: icon('baby') },
        { label: 'Cuidado lúdico de adulto mayor', value: 'adulto_mayor', icon: icon('heart') },
        { label: 'Cocinera', value: 'cocinera', icon: icon('utensils') },
        { label: 'Empleada doméstica', value: 'domestica', icon: icon('home') }
      ],
      field: 'tipo',
      next: () => 'contexto'
    }
  };

  // ---- Familia logueada: cargar datos ----
  let _familiaLogueada = null;
  function detectarFamiliaLogueada() {
    try {
      const fam = JSON.parse(localStorage.getItem('qqmc_familia') || 'null');
      if (fam && fam.id) {
        _familiaLogueada = fam;
        return true;
      }
    } catch(e) {}
    return false;
  }

  async function cargarBusquedaPrevia() {
    if (!_familiaLogueada || !_familiaLogueada.email) return null;
    try {
      const res = await fetch(`${API_BASE}/familias/me?email=${encodeURIComponent(_familiaLogueada.email)}`);
      const json = await res.json();
      if (json.ok && json.data && json.data.busqueda && json.data.busqueda.tipo) {
        return json.data.busqueda;
      }
    } catch(e) {}
    return null;
  }

  function guardarBusqueda() {
    if (!_familiaLogueada || !_familiaLogueada.id) return;
    const busqueda = {
      tipo: answers.tipo,
      zona: answers.zona,
      dias: answers.dias,
      franja: answers.franja,
      experiencia_min: answers.experiencia_min,
      verificado: answers.verificado,
      user_lat: answers.user_lat,
      user_lng: answers.user_lng,
      distancia_km: answers.distancia_km,
      ultima_busqueda: new Date().toISOString()
    };
    // Guardar en background, no bloquear
    fetch(`${API_BASE}/familias/${_familiaLogueada.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busqueda })
    }).catch(() => {});
  }

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', async () => {
    chatForm.addEventListener('submit', handleSubmit);

    if (detectarFamiliaLogueada()) {
      // Familia logueada: intentar flujo express
      const busqueda = await cargarBusquedaPrevia();
      answers._nombre_familia = _familiaLogueada.nombre || '';
      if (busqueda && busqueda.tipo) {
        answers._busqueda_previa = busqueda;
        runStep('express_welcome');
      } else {
        runStep('express_new');
      }
    } else {
      runStep('welcome');
    }
  });

  // ---- Core: ejecutar un paso ----
  async function runStep(stepId) {
    step = stepId;

    if (stepId === 'reset') {
      Object.keys(answers).forEach(k => delete answers[k]);
      cuidadoresActuales = [];
      resultsPane.classList.add('hidden');
      resultsList.innerHTML = '';
      if (_familiaLogueada) {
        answers._nombre_familia = _familiaLogueada.nombre || '';
        return runStep('express_new');
      }
      return runStep('welcome');
    }

    const s = FLOW[stepId];
    if (!s) return;

    const msgs = typeof s.bot === 'function' ? s.bot(answers, cuidadoresActuales.length) : s.bot;
    for (const msg of msgs) {
      await addBotMessage(msg);
    }

    if (s.action === 'geolocate') {
      await doGeolocate();
      return;
    }
    if (s.action === 'search') {
      await doBusqueda(false);
      return;
    }
    if (s.action === 'search_wide') {
      await doBusqueda(true);
      return;
    }

    showInteraction(s);
  }

  // ---- Mostrar opciones / input ----
  function showInteraction(s) {
    chatOptions.innerHTML = '';

    if (s.multiOptions) {
      renderMultiSelect(s);
    } else if (s.options) {
      renderOptions(s);
    }

    if (s.input) {
      chatInput.placeholder = s.placeholder || 'Escribí acá…';
      chatInput.disabled = false;
      chatInput.focus();
    } else if (!s.multiOptions) {
      chatInput.disabled = true;
    }

    scrollToBottom();
  }

  function renderOptions(s) {
    s.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-option';
      btn.innerHTML = `<span class="chat-option__icon">${opt.icon || ''}</span> ${opt.label}`;
      btn.addEventListener('click', () => {
        addUserMessage(opt.label);
        answers[s.field] = opt.value;
        chatOptions.innerHTML = '';
        chatInput.disabled = true;
        const next = typeof s.next === 'function' ? s.next(answers) : s.next;
        setTimeout(() => runStep(next), 400);
      });
      chatOptions.appendChild(btn);
    });
  }

  function renderMultiSelect(s) {
    const selected = new Set();
    const wrap = document.createElement('div');
    wrap.className = 'chat-multi';

    s.multiOptions.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-option chat-option--multi';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        if (selected.has(opt.value)) {
          selected.delete(opt.value);
          btn.classList.remove('is-selected');
        } else {
          selected.add(opt.value);
          btn.classList.add('is-selected');
        }
      });
      wrap.appendChild(btn);
    });

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'chat-option chat-option--confirm';
    confirm.textContent = 'Confirmar';
    confirm.addEventListener('click', () => {
      if (!selected.size) return;
      const vals = Array.from(selected);
      addUserMessage(vals.map(v => {
        const o = s.multiOptions.find(x => x.value === v);
        return o ? o.label : v;
      }).join(', '));
      answers[s.field] = vals.join(',');
      chatOptions.innerHTML = '';
      chatInput.disabled = true;
      const next = typeof s.next === 'function' ? s.next(answers) : s.next;
      setTimeout(() => runStep(next), 400);
    });

    chatOptions.appendChild(wrap);
    chatOptions.appendChild(confirm);
    chatInput.disabled = true;
  }

  // ---- Submit libre (input de texto) ----
  function handleSubmit(e) {
    e.preventDefault();
    const val = chatInput.value.trim();
    if (!val || chatInput.disabled) return;

    const s = FLOW[step];
    if (!s || !s.input) return;

    addUserMessage(val);
    answers[s.field] = val;
    chatInput.value = '';
    chatInput.disabled = true;
    chatOptions.innerHTML = '';

    const next = typeof s.next === 'function' ? s.next(answers) : s.next;
    setTimeout(() => runStep(next), 400);
  }

  // ---- Geolocalización ----
  async function doGeolocate() {
    showTyping();
    if (!navigator.geolocation) {
      removeTyping();
      await addBotMessage('Tu navegador no soporta geolocalización, pero no pasa nada. Vamos a buscar en toda la zona.');
      setTimeout(() => runStep('dias'), 400);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        removeTyping();
        answers.user_lat = pos.coords.latitude;
        answers.user_lng = pos.coords.longitude;
        addBotMessage('Listo, ya tengo tu ubicación.');
        setTimeout(() => runStep('distancia'), 400);
      },
      () => {
        removeTyping();
        addBotMessage('No pude acceder a tu ubicación, pero no te preocupes. Vamos a buscar en toda la zona que me indicaste.');
        setTimeout(() => runStep('dias'), 400);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ---- Cálculo de distancia (Haversine) ----
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ---- Búsqueda en la API ----
  async function doBusqueda(wide) {
    showTyping();

    const qs = new URLSearchParams();
    const verTodosZona = wide && answers._ampliar === 'ver_todos_zona';

    if (answers.tipo && answers.tipo !== 'todos') qs.set('tipo', answers.tipo);

    if (wide && answers._ampliar === 'ampliar_zona') {
      // no ponemos zona
    } else if (answers.zona) {
      qs.set('zona', answers.zona);
    }

    if (!verTodosZona) {
      if (answers.dias && answers.dias !== '_custom') qs.set('dias', answers.dias);
      if (answers.franja) qs.set('franja', answers.franja);

      if (wide && answers._ampliar === 'ampliar_exp') {
        // no ponemos experiencia
      } else if (answers.experiencia_min && answers.experiencia_min !== '0') {
        qs.set('experiencia_min', answers.experiencia_min);
      }

      if (answers.verificado === '1') qs.set('verificado', '1');
    }

    try {
      const res = await fetch(`${API_BASE}/cuidadores?${qs.toString()}`);
      const json = await res.json();
      removeTyping();

      if (!json.ok) throw new Error(json.error);

      cuidadoresActuales = json.data || [];

      // Filtro de distancia en el cliente (se salta si pidió ver todos de la zona)
      if (answers.user_lat && answers.distancia_km && !verTodosZona) {
        const maxKm = Number(answers.distancia_km);
        cuidadoresActuales = cuidadoresActuales
          .map(c => {
            if (c.lat != null && c.lng != null) {
              c._distancia = haversineKm(answers.user_lat, answers.user_lng, c.lat, c.lng);
            } else {
              c._distancia = Infinity;
            }
            return c;
          })
          .filter(c => c._distancia <= maxKm)
          .sort((a, b) => a._distancia - b._distancia);
      }

      if (cuidadoresActuales.length === 0) {
        runStep('sin_resultados');
      } else {
        renderResultsInChat(cuidadoresActuales);
        showMapResults(cuidadoresActuales);
        guardarBusqueda(); // Guardar preferencias para flujo express
        runStep('resultados_ok');
      }
    } catch (err) {
      removeTyping();
      addBotMessage('Ups, tuve un problema al buscar. ¿Podés intentar de nuevo en unos segundos?');
    }
  }

  // ---- Render cards en el chat ----
  function renderResultsInChat(cuidadores) {
    const container = document.createElement('div');
    container.className = 'chat-results';

    cuidadores.slice(0, 6).forEach(c => {
      const card = document.createElement('div');
      card.className = 'chat-card';
      card.addEventListener('click', () => abrirFicha(c.id));

      const rating = Number(c.valoracion) > 0
        ? `<span class="chat-card__stars">${icon('starFilled', 'gold')} ${Number(c.valoracion).toFixed(1)}</span> <span class="chat-card__reviews">(${c.resenas || 0})</span>`
        : '<span class="chat-card__reviews">Sin reseñas</span>';

      card.innerHTML = `
        <img class="chat-card__avatar" src="${c.foto}" alt="${escapeHtml(c.nombre)}" />
        <div class="chat-card__info">
          <div class="chat-card__name">
            ${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}
            ${c.verificado ? '<span class="chat-card__verified">' + icon('check', 'success') + '</span>' : ''}
          </div>
          <div class="chat-card__meta">${labelEspecialidad(c)} · ${escapeHtml(c.zona)}</div>
          <div class="chat-card__rating">${rating}</div>
          <div class="chat-card__exp">${c.experiencia_anios || 0} años de experiencia${c._distancia != null && c._distancia !== Infinity ? ' · a ' + c._distancia.toFixed(1) + ' km' : ''}</div>
          ${c.valor_hora_min ? `<div class="chat-card__tarifa">${icon('dollarSign')} $${c.valor_hora_min.toLocaleString('es-AR')}${c.valor_hora_max && c.valor_hora_max !== c.valor_hora_min ? ' - $' + c.valor_hora_max.toLocaleString('es-AR') : ''}/h</div>` : ''}
        </div>
        <div class="chat-card__arrow">›</div>
      `;
      container.appendChild(card);
    });

    if (cuidadores.length > 6) {
      const more = document.createElement('div');
      more.className = 'chat-results__more';
      more.textContent = `+${cuidadores.length - 6} más — mirá el mapa abajo`;
      container.appendChild(more);
    }

    const msgWrap = document.createElement('div');
    msgWrap.className = 'chat-msg chat-msg--bot';
    msgWrap.innerHTML = CARO_AVATAR_HTML;
    msgWrap.appendChild(container);
    chatMessages.appendChild(msgWrap);
    scrollToBottom();
  }

  // ---- Mapa ----
  function showMapResults(cuidadores) {
    resultsPane.classList.remove('hidden');

    if (!cuidadores.length) {
      resultsList.innerHTML = '<p class="results__hint">No hay resultados.</p>';
    } else {
      resultsList.innerHTML = `<p class="results__hint" style="margin-bottom:10px">${cuidadores.length} resultado${cuidadores.length === 1 ? '' : 's'}</p>`;
      cuidadores.forEach(c => resultsList.appendChild(cardEl(c)));
    }

    if (typeof window.renderMarkers === 'function') {
      window.renderMarkers(cuidadores);
    }

    setTimeout(() => {
      const m = window.qqmc?.map;
      if (m) {
        m.invalidateSize();
        // Aplicar zoom después de que el mapa tenga dimensiones correctas
        if (typeof window.fitPendingBounds === 'function') window.fitPendingBounds();
      }
      resultsPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
  }

  // ---- Card para la lista lateral ----
  function cardEl(c) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = c.id;
    const rating = Number(c.valoracion) > 0
      ? `${icon('starFilled', 'gold')} ${Number(c.valoracion).toFixed(1)} <span>(${c.resenas || 0} reseñas)</span>`
      : '<span style="color:var(--muted)">Sin reseñas aún</span>';
    el.innerHTML = `
      <img class="card__avatar" src="${c.foto}" alt="${c.nombre}" />
      <div class="card__body">
        <div class="card__name">
          ${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}
          ${c.verificado ? '<span class="card__badge">Verificado</span>' : ''}
          ${c.recomendado ? '<span class="card__badge card__badge--rec">Recomendado</span>' : ''}
        </div>
        <div class="card__meta">${labelEspecialidad(c)} · ${escapeHtml(c.zona)}</div>
        <div class="card__rating">${rating}</div>
        ${c.valor_hora_min ? `<div class="card__tarifa">$${c.valor_hora_min.toLocaleString('es-AR')}${c.valor_hora_max && c.valor_hora_max !== c.valor_hora_min ? ' - $' + c.valor_hora_max.toLocaleString('es-AR') : ''}/h</div>` : ''}
      </div>
    `;
    el.addEventListener('click', () => {
      abrirFicha(c.id);
      if (typeof window.highlightAndPanTo === 'function') {
        window.highlightAndPanTo(c.id);
      }
    });
    return el;
  }

  // ---- Abrir ficha ----
  async function abrirFicha(id) {
    if (typeof window.abrirFicha === 'function') {
      window.abrirFicha(id);
    }
  }

  // ---- Mensajes del chat ----
  const CARO_AVATAR_HTML = `<img class="caro-avatar caro-avatar--sm" src="assets/caro-avatar.png" alt="Caro" />`;

  function addBotMessage(text) {
    return new Promise(resolve => {
      const msg = document.createElement('div');
      msg.className = 'chat-msg chat-msg--bot';
      msg.innerHTML = CARO_AVATAR_HTML;
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble chat-bubble--bot';
      bubble.textContent = text;
      msg.appendChild(bubble);
      chatMessages.appendChild(msg);
      scrollToBottom();
      setTimeout(resolve, 350);
    });
  }

  function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg--user';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--user';
    bubble.textContent = text;
    msg.appendChild(bubble);
    chatMessages.appendChild(msg);
    scrollToBottom();
  }

  function showTyping() {
    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg--bot';
    msg.id = 'typingIndicator';
    msg.innerHTML = `${CARO_AVATAR_HTML}
      <div class="chat-bubble chat-bubble--bot chat-typing">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    `;
    chatMessages.appendChild(msg);
    scrollToBottom();
  }

  function removeTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ---- Utils ----
  function labelEspecialidad(c) {
    const esps = c.especialidades || [];
    // Si el usuario buscó un tipo específico y el cuidador lo tiene, mostrar ese
    if (answers.tipo && answers.tipo !== 'todos' && esps.includes(answers.tipo)) {
      // Si tiene más de una especialidad, indicar la buscada + las otras
      const otras = esps.filter(e => e !== answers.tipo).map(e => ESPECIALIDAD_LABEL[e]).filter(Boolean);
      const principal = ESPECIALIDAD_LABEL[answers.tipo] || '';
      return otras.length ? principal + ' · también ' + otras.join(', ') : principal;
    }
    // Sin filtro específico: mostrar todas
    return esps.map(e => ESPECIALIDAD_LABEL[e]).filter(Boolean).join(' · ') || ESPECIALIDAD_LABEL[c.especialidad] || '';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }
})();
