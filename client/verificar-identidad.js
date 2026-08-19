/* Verificación de identidad — página independiente para familias
   La familia ya tiene cuenta, viene a completar DNI + selfie
*/
(() => {
  const API_BASE = '/.netlify/functions/api';

  let dniDataUrl = null;
  let selfieDataUrl = null;
  let cameraStream = null;

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    checkEstado();
  });

  function checkEstado() {
    const familia = JSON.parse(localStorage.getItem('qqmc_familia') || 'null');

    if (!familia || !familia.id) {
      document.getElementById('notLoggedIn').classList.remove('hidden');
      return;
    }

    if (familia.estado === 'aprobada') {
      document.getElementById('alreadyVerified').classList.remove('hidden');
      return;
    }

    // Check if verification was already submitted (estado could be 'pendiente_verificacion')
    // For now, show the form for any non-approved state
    if (familia.estado === 'pendiente_verificacion') {
      document.getElementById('pendingReview').classList.remove('hidden');
      return;
    }

    // Show verification form
    document.getElementById('verifyForm').classList.remove('hidden');
    initIdentityVerification();
    initSubmit(familia);
  }

  // === Verificación de identidad: DNI + selfie ===
  function initIdentityVerification() {
    const dniInput = document.getElementById('dniInput');
    dniInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Por favor seleccioná una imagen.'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        dniDataUrl = ev.target.result;
        document.getElementById('dniImg').src = dniDataUrl;
        document.getElementById('dniPreview').classList.add('has-image');
        document.getElementById('dniStatus').textContent = 'Foto del DNI cargada';
        document.getElementById('dniStatus').className = 'verify-card__status is-ok';
        document.getElementById('dniCard').classList.add('has-data');
        document.getElementById('dniLabel').innerHTML =
          '<input type="file" id="dniInput2" accept="image/*" capture="environment" hidden /> Cambiar foto';
        document.getElementById('dniInput2').addEventListener('change', (e2) => {
          dniInput.files = e2.target.files;
          dniInput.dispatchEvent(new Event('change'));
        });
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btnStartCamera').addEventListener('click', startCamera);
    document.getElementById('btnCapture').addEventListener('click', capturePhoto);
    document.getElementById('btnRetake').addEventListener('click', retakePhoto);
  }

  async function startCamera() {
    const video = document.getElementById('cameraVideo');
    const container = document.getElementById('cameraContainer');
    const btnStart = document.getElementById('btnStartCamera');
    const btnCapture = document.getElementById('btnCapture');
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      video.srcObject = cameraStream;
      container.classList.add('is-active');
      btnStart.hidden = true;
      btnCapture.hidden = false;
      document.getElementById('selfiePreview').classList.remove('has-image');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        alert('Necesitamos acceso a tu cámara para sacar la selfie. Habilitá el permiso en tu navegador.');
      } else if (err.name === 'NotFoundError') {
        alert('No detectamos una cámara en tu dispositivo.');
      } else {
        alert('No pudimos acceder a la cámara: ' + err.message);
      }
    }
  }

  function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    selfieDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    document.getElementById('selfieImg').src = selfieDataUrl;
    document.getElementById('selfiePreview').classList.add('has-image');

    video.pause();
    stopCamera();
    document.getElementById('cameraContainer').classList.remove('is-active');
    document.getElementById('btnCapture').hidden = true;
    document.getElementById('btnStartCamera').hidden = true;
    document.getElementById('btnRetake').hidden = false;
    document.getElementById('selfieStatus').textContent = 'Selfie capturada';
    document.getElementById('selfieStatus').className = 'verify-card__status is-ok';
    document.getElementById('selfieCard').classList.add('has-data');
  }

  function retakePhoto() {
    selfieDataUrl = null;
    document.getElementById('selfiePreview').classList.remove('has-image');
    document.getElementById('selfieStatus').textContent = '';
    document.getElementById('selfieStatus').className = 'verify-card__status';
    document.getElementById('selfieCard').classList.remove('has-data');
    document.getElementById('btnRetake').hidden = true;
    document.getElementById('btnStartCamera').hidden = false;
    document.getElementById('btnCapture').hidden = true;
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      cameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) { video.pause(); video.srcObject = null; video.load(); }
  }

  // === Submit ===
  function initSubmit(familia) {
    document.getElementById('verifyForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validaciones
      if (!dniDataUrl) {
        alert('Subí una foto del frente de tu DNI para continuar.');
        return;
      }
      if (!selfieDataUrl) {
        alert('Sacate una selfie sosteniendo el DNI para continuar.');
        return;
      }
      if (!document.getElementById('consent_privacidad').checked) {
        alert('Tenés que aceptar la política de privacidad para continuar.');
        return;
      }
      if (!document.getElementById('consent_datos_veraces').checked) {
        alert('Tenés que declarar que los datos son verdaderos.');
        return;
      }

      const btn = document.getElementById('btnSubmitVerify');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      try {
        const res = await fetch(`${API_BASE}/familias/${familia.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verificacion: {
              dni_foto: dniDataUrl,
              selfie: selfieDataUrl,
              estado: 'pendiente'
            },
            consentimientos: {
              privacidad: true,
              datos_veraces: true
            }
          })
        });

        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'Error al enviar');

        // Update local state
        familia.estado = 'pendiente_verificacion';
        localStorage.setItem('qqmc_familia', JSON.stringify(familia));

        stopCamera();
        document.getElementById('okModal').classList.remove('hidden');
      } catch (err) {
        alert('No pudimos enviar la verificación: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Enviar verificación';
      }
    });
  }
})();
