// Outils communs aux pages de l'équipe (cuisine, gestion) : accès par PIN
// et onglets. Le PIN n'est gardé que le temps de la session du navigateur ;
// chaque appel le renvoie à la base, qui le vérifie (verifier_pin).

import { rpc } from "./api.js";

const CLE = "ti-mael:pin";

function lirePin() {
  try { return sessionStorage.getItem(CLE); } catch { return null; }
}

function ecrirePin(pin) {
  try {
    if (pin) sessionStorage.setItem(CLE, pin);
    else sessionStorage.removeItem(CLE);
  } catch { /* stockage indisponible : il faudra ressaisir le code */ }
}

let pin = lirePin();

/** Appel protégé : ajoute le PIN, et renvoie à la porte s'il est refusé. */
export async function appel(nom, parametres = {}) {
  try {
    return await rpc(nom, { p_pin: pin, ...parametres });
  } catch (err) {
    if (/PIN/i.test(err.message)) {
      ecrirePin(null);
      location.reload();
    }
    throw err;
  }
}

/**
 * Branche la porte d'entrée. `verifier` est un appel protégé quelconque qui
 * échoue si le PIN est faux ; `demarrer` lance la page une fois entré.
 */
export function porte({ verifier, demarrer }) {
  const form = document.querySelector("#porte");
  const erreur = form.querySelector(".message-erreur");
  const entrer = () => {
    form.hidden = true;
    document.querySelectorAll("[data-connecte]").forEach((x) => { x.hidden = false; });
    demarrer();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const essai = form.elements.pin.value;
    try {
      await rpc(verifier, { p_pin: essai });
      pin = essai;
      ecrirePin(essai);
      entrer();
    } catch (err) {
      erreur.textContent = /PIN/i.test(err.message) ? "Code incorrect." : err.message;
      erreur.hidden = false;
    }
  });

  document.querySelector("[data-deconnexion]")?.addEventListener("click", () => {
    ecrirePin(null);
    location.reload();
  });

  if (pin) entrer();
  else form.elements.pin.focus();
}

/** Onglets simples : [data-onglet] ↔ [data-panneau]. */
export function onglets(surChangement = () => {}) {
  const boutons = [...document.querySelectorAll("[data-onglet]")];
  boutons.forEach((b) => b.addEventListener("click", () => {
    boutons.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll("[data-panneau]").forEach((p) => {
      p.hidden = p.dataset.panneau !== b.dataset.onglet;
    });
    surChangement(b.dataset.onglet);
  }));
}

/** Message bref en bas d'écran. */
export function signaler(texte, erreur = false) {
  let zone = document.querySelector(".signal");
  if (!zone) {
    zone = document.createElement("p");
    zone.className = "signal";
    zone.setAttribute("role", "status");
    document.body.append(zone);
  }
  zone.textContent = texte;
  zone.classList.toggle("signal--erreur", erreur);
  zone.classList.add("signal--visible");
  clearTimeout(zone.minuteur);
  zone.minuteur = setTimeout(() => zone.classList.remove("signal--visible"), 3200);
}
