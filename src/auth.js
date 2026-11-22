import { S } from './state.js';
import { $ } from './utils.js';
import { closePanel } from './ui.js';
import { emit, on } from './bus.js';
import { esGestor } from './services/permisos.js';
import {
  session, login, registrar, logout as cerrarSesion
} from './services/auth.service.js';

let registering = false;

function setRole(role, name, email = '') {
  S.role = role;
  S.uname = name;
  S.email = email;
  const label = $('#bUser');
  label.textContent = role === 'guest' ? 'LOGIN' : name.toUpperCase() + ' ✕';
  label.title = role === 'guest' ? 'Iniciar sesión' : 'Cerrar sesión';
  $('#bAdd').hidden = !esGestor(role);
  showLogin(false);
  emit('auth:change', { role, name });
}

function showLogin(visible) {
  $('#login').hidden = !visible;
}

function updateMode() {
  $('#fn').hidden = !registering;
  $('#lt').textContent = registering ? 'Crear cuenta' : 'Iniciar sesión';
  $('#lgo').textContent = registering ? 'Registrarme' : 'Entrar';
  $('#lsw').textContent = registering
    ? '¿Ya tienes cuenta? Inicia sesión'
    : '¿No tienes cuenta? Regístrate';
  $('#lm').textContent = '';
}

export function logout() {
  cerrarSesion();
  setRole('guest', '', '');
  closePanel('account');
}

on('auth:logout', logout);

export function initAuth() {
  const actual = session();
  if (actual.role !== 'guest') setRole(actual.role, actual.name, actual.email);

  $('#bUser').addEventListener('click', () => {
    if (S.role !== 'guest') {
      emit('account:open');
      return;
    }
    registering = false;
    updateMode();
    showLogin(true);
  });

  $('#xLg').addEventListener('click', () => showLogin(false));
  $('#lsw').addEventListener('click', () => { registering = !registering; updateMode(); });

  $('#lgo').addEventListener('click', async () => {
    const email = $('#le').value.trim().toLowerCase();
    const password = $('#lp').value;
    const message = $('#lm');
    if (!email || password.length < 6) {
      message.textContent = 'Email y contraseña (mín. 6 caracteres).';
      return;
    }
    message.textContent = 'Verificando…';
    try {
      if (registering) {
        const result = await registrar({
          email,
          password,
          nombre: $('#ln').value.trim() || email.split('@')[0]
        });
        if (!result.ok) { message.textContent = result.mensaje; return; }
        setRole(result.role, result.name, result.email);
        return;
      }

      const result = await login(email, password);
      if (!result.ok) { message.textContent = result.mensaje; return; }
      setRole(result.role, result.name, result.email);
    } catch (err) {
      message.textContent = err?.message || 'No se pudo verificar la cuenta.';
    }
  });
}
