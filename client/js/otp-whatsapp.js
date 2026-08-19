/* =============================================================
   Cuidy · OTP WhatsApp verification
   Componente reutilizable para verificar teléfono por WhatsApp
   ============================================================= */

(function () {
  const API = '/.netlify/functions/api';
  let cooldownInterval = null;

  function initOtp() {
    const btnSend = document.getElementById('btnOtpSend');
    const btnVerify = document.getElementById('btnOtpVerify');
    if (!btnSend || !btnVerify) return;

    const telefonoInput = document.getElementById('telefono');
    const otpSection = document.getElementById('otpVerify');
    const otpCodeInput = document.getElementById('otpCode');
    const otpStatus = document.getElementById('otpStatus');
    const hiddenVerified = document.getElementById('telefonoVerificado');

    // Si ya está verificado, mostrar estado
    if (hiddenVerified.value) {
      markVerified(telefonoInput, btnSend, otpSection);
    }

    // Enviar OTP
    btnSend.addEventListener('click', async () => {
      const tel = telefonoInput.value.trim();
      if (!tel) { telefonoInput.focus(); return; }

      btnSend.disabled = true;
      btnSend.textContent = 'Enviando…';
      otpStatus.textContent = '';

      try {
        const res = await fetch(`${API}/auth/otp-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefono: tel })
        });
        const json = await res.json();
        if (json.ok) {
          otpSection.classList.remove('hidden');
          otpCodeInput.focus();
          btnSend.textContent = 'Reenviar';
          btnSend.disabled = false;
          startCooldown(btnSend, 30);
        } else {
          otpStatus.textContent = json.error || 'Error al enviar código';
          otpStatus.className = 'otp-verify__status otp-verify__status--error';
          btnSend.textContent = 'Verificar';
          btnSend.disabled = false;
        }
      } catch {
        otpStatus.textContent = 'Sin conexión. Intentá nuevamente.';
        otpStatus.className = 'otp-verify__status otp-verify__status--error';
        btnSend.textContent = 'Verificar';
        btnSend.disabled = false;
      }
    });

    // Verificar código
    btnVerify.addEventListener('click', async () => {
      const code = otpCodeInput.value.trim();
      if (code.length !== 6) { otpCodeInput.focus(); return; }

      btnVerify.disabled = true;
      btnVerify.textContent = 'Verificando…';

      try {
        const res = await fetch(`${API}/auth/otp-verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefono: telefonoInput.value.trim(), code })
        });
        const json = await res.json();
        if (json.ok) {
          hiddenVerified.value = json.telefono;
          // Cancelar cooldown antes de marcar verificado
          stopCooldown();
          markVerified(telefonoInput, btnSend, otpSection);
          otpStatus.innerHTML = icon('check', 'success') + ' WhatsApp verificado';
          otpStatus.className = 'otp-verify__status otp-verify__status--ok';
        } else {
          otpStatus.textContent = json.error || 'Código incorrecto';
          otpStatus.className = 'otp-verify__status otp-verify__status--error';
          btnVerify.disabled = false;
          btnVerify.textContent = 'Confirmar';
        }
      } catch {
        otpStatus.textContent = 'Sin conexión.';
        otpStatus.className = 'otp-verify__status otp-verify__status--error';
        btnVerify.disabled = false;
        btnVerify.textContent = 'Confirmar';
      }
    });

    // Auto-submit al completar 6 dígitos
    otpCodeInput.addEventListener('input', () => {
      otpCodeInput.value = otpCodeInput.value.replace(/\D/g, '');
      if (otpCodeInput.value.length === 6) btnVerify.click();
    });

    // Si cambia el teléfono, resetear verificación
    telefonoInput.addEventListener('input', () => {
      if (hiddenVerified.value) {
        hiddenVerified.value = '';
        stopCooldown();
        btnSend.textContent = 'Verificar';
        btnSend.disabled = false;
        btnSend.classList.remove('otp-verified');
        telefonoInput.readOnly = false;
        otpSection.classList.add('hidden');
        otpStatus.textContent = '';
        otpCodeInput.value = '';
      }
    });
  }

  function markVerified(input, btn, section) {
    btn.innerHTML = icon('check', 'success') + ' Verificado';
    btn.disabled = true;
    btn.classList.add('otp-verified');
    input.readOnly = true;
    section.classList.add('hidden');
  }

  function startCooldown(btn, seconds) {
    stopCooldown(); // limpiar cualquier cooldown previo
    btn.disabled = true;
    let remaining = seconds;
    const originalText = btn.textContent;
    cooldownInterval = setInterval(() => {
      // Si ya está verificado, parar
      if (btn.classList.contains('otp-verified')) {
        stopCooldown();
        return;
      }
      remaining--;
      btn.textContent = `Reenviar (${remaining}s)`;
      if (remaining <= 0) {
        stopCooldown();
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }, 1000);
  }

  function stopCooldown() {
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  }

  // Init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOtp);
  } else {
    initOtp();
  }
})();
