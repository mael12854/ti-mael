// Écran cuisine : tickets du service en cours, ruptures, ouverture, historique.

import { rpc, euros, html, heure, STATUTS, joursOuverts } from "./api.js";
import { appel, porte, onglets, signaler } from "./equipe.js";

const $ = (s) => document.querySelector(s);

const SUIVANT = {
  recue: ["en_preparation", "Lancer"],
  en_preparation: ["prete", "Prête"],
  prete: ["servie", "Servie"],
};

let connus = null;      // ids déjà vus, pour sonner à l'arrivée d'une commande
let ongletActif = "en-cours";

function sonner() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
  } catch { /* pas de son possible : l'écran suffit */ }
}

function depuis(date) {
  const min = Math.round((Date.now() - new Date(date)) / 60000);
  return min < 1 ? "à l'instant" : `il y a ${min} min`;
}

function ticket(c) {
  const [suivant, libelle] = SUIVANT[c.statut] ?? [];
  const termine = c.statut === "servie" || c.statut === "annulee";
  return `
    <article class="ticket ticket--${c.statut}" data-id="${c.id}">
      <header class="ticket__entete">
        <span class="ticket__numero">${c.numero_jour}</span>
        <span class="ticket__infos">
          <strong>${html(c.client_nom || "—")}</strong>
          <span>${c.mode === "a_emporter" ? "À emporter" : `Sur place${c.table_numero ? ` · table ${html(c.table_numero)}` : ""}`}</span>
          <span>${depuis(c.created_at)}${c.heure_souhaitee ? ` · <b>pour ${heure(c.heure_souhaitee)}</b>` : ""}</span>
        </span>
        <span class="ticket__statut">${STATUTS[c.statut]}</span>
      </header>
      <ul class="ticket__lignes">
        ${c.lignes.map((l) => `<li><b>${l.quantite}×</b> ${html(l.nom)}</li>`).join("")}
      </ul>
      ${c.note ? `<p class="ticket__note">${html(c.note)}</p>` : ""}
      <footer class="ticket__pied">
        <span class="ticket__total">${euros(c.total_cents)}${c.remise_cents ? ` <small title="${html(c.remise_detail)}">(−${euros(c.remise_cents)})</small>` : ""}
          · ${c.statut_paiement === "paye" ? "réglé" : "à régler"}</span>
        <span class="ticket__actions">
          ${c.statut_paiement !== "paye" && c.statut !== "annulee"
            ? '<button class="bouton bouton--petit bouton--contour" data-action="encaisser">Encaissé</button>' : ""}
          ${!termine ? '<button class="bouton bouton--petit bouton--texte" data-action="annuler">Annuler</button>' : ""}
          ${c.statut === "annulee" ? '<button class="bouton bouton--petit bouton--texte" data-action="supprimer">Supprimer</button>' : ""}
          ${suivant ? `<button class="bouton bouton--petit bouton--ardoise" data-action="avancer" data-statut="${suivant}">${libelle}</button>` : ""}
        </span>
      </footer>
    </article>`;
}

async function chargerTickets() {
  const commandes = await appel("cuisine_commandes");
  const actives = commandes.filter((c) => !["servie", "annulee"].includes(c.statut));
  const finies = commandes.filter((c) => ["servie", "annulee"].includes(c.statut)).reverse();

  const ids = new Set(commandes.map((c) => c.id));
  if (connus && [...ids].some((id) => !connus.has(id))) sonner();
  connus = ids;

  $("#compteur").textContent = actives.length ? String(actives.length) : "";
  $("#tickets").innerHTML = actives.length
    ? actives.map(ticket).join("")
    : '<p class="message-info">Aucune commande en attente.</p>';
  if (finies.length) {
    $("#tickets").insertAdjacentHTML("beforeend", `
      <details class="tickets__finies">
        <summary>Servies ou annulées pendant ce service (${finies.length})</summary>
        <div class="tickets">${finies.map(ticket).join("")}</div>
      </details>`);
  }
}

$("#tickets").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  const action = b.dataset.action;
  if (action === "annuler" && !confirm("Annuler cette commande ?")) return;
  if (action === "supprimer" && !confirm("Supprimer définitivement cette commande ?")) return;
  b.disabled = true;
  try {
    if (action === "avancer") await appel("cuisine_avancer", { p_id: id, p_statut: b.dataset.statut });
    if (action === "annuler") await appel("cuisine_avancer", { p_id: id, p_statut: "annulee" });
    if (action === "encaisser") await appel("cuisine_encaisser", { p_id: id });
    if (action === "supprimer") await appel("cuisine_supprimer", { p_id: id });
    await chargerTickets();
  } catch (err) {
    signaler(err.message, true);
    b.disabled = false;
  }
});

/* Ruptures -------------------------------------------------------------- */

async function chargerRuptures() {
  const rubriques = await appel("cuisine_carte");
  $("#ruptures").innerHTML = rubriques.filter((r) => r.articles.length).map((r) => `
    <div class="bloc">
      <h2 class="surtitre">${html(r.nom)}</h2>
      ${r.articles.map((a) => `
        <label class="interrupteur">
          <input type="checkbox" data-article="${a.id}" ${a.disponible ? "checked" : ""}>
          <span>${html(a.nom)}</span>
        </label>`).join("")}
    </div>`).join("");
}

$("#ruptures").addEventListener("change", async (e) => {
  const c = e.target.closest("[data-article]");
  if (!c) return;
  try {
    await appel("cuisine_rupture", { p_id: c.dataset.article, p_disponible: c.checked });
    signaler(c.checked ? "Remis à la carte." : "Retiré de la carte.");
  } catch (err) {
    c.checked = !c.checked;
    signaler(err.message, true);
  }
});

/* Service --------------------------------------------------------------- */

function afficherService(s) {
  const pastille = $("#service-pastille");
  pastille.textContent = s.ouvert ? "Commandes ouvertes" : "Commandes fermées";
  pastille.classList.toggle("service-pastille--ferme", !s.ouvert);
  const radio = document.querySelector(`#service-mode input[value="${s.mode}"]`);
  if (radio) radio.checked = true;
  $("#service-detail").textContent =
    `Horaires : ${joursOuverts(s.jours)}, ${heure(s.debut)} – ${heure(s.fin)}. ` +
    "Les horaires se changent dans Admin.";
}

async function chargerService() {
  afficherService(await rpc("service_etat"));
}

$("#service-mode").addEventListener("change", async (e) => {
  try {
    afficherService(await appel("cuisine_basculer_service", { p_mode: e.target.value }));
    signaler("Mode de service enregistré.");
  } catch (err) {
    signaler(err.message, true);
  }
});

/* Commandes passées ------------------------------------------------------ */

async function chargerPassees() {
  const passees = await appel("cuisine_passees");
  if (!passees.length) {
    $("#passees").innerHTML =
      '<caption class="message-info">Pas encore de commande des services précédents.</caption>';
    return;
  }
  $("#passees").innerHTML = `
    <thead><tr><th>Jour</th><th>N°</th><th>Client</th><th>Articles</th><th>Total</th><th>Statut</th></tr></thead>
    <tbody>${passees.map((c) => `
      <tr>
        <td>${new Date(c.jour).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</td>
        <td>${c.numero_jour}</td>
        <td>${html(c.client_nom || "—")}</td>
        <td>${c.lignes.map((l) => `${l.quantite}× ${html(l.nom)}`).join("<br>")}</td>
        <td>${euros(c.total_cents)}</td>
        <td>${STATUTS[c.statut]}${c.statut_paiement === "paye" ? "" : " · non réglé"}</td>
      </tr>`).join("")}</tbody>`;
}

/* Démarrage ------------------------------------------------------------- */

function rafraichir() {
  const taches = { "en-cours": chargerTickets, ruptures: chargerRuptures, passees: chargerPassees, service: chargerService };
  return (taches[ongletActif]?.() ?? Promise.resolve()).catch((err) => signaler(err.message, true));
}

porte({
  verifier: "cuisine_carte",
  demarrer() {
    onglets((nom) => { ongletActif = nom; rafraichir(); });
    chargerService().catch(() => {});
    rafraichir();
    // Les tickets se mettent à jour toutes les 5 s ; l'état du service, chaque minute.
    setInterval(() => { if (ongletActif === "en-cours") chargerTickets().catch(() => {}); }, 5000);
    setInterval(() => chargerService().catch(() => {}), 60000);
  },
});
