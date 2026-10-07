// Fidélité : solde de points, lots gagnés, et la roue.

import { rpc, euros, html, memoire } from "./api.js";

const form = document.querySelector("#form-tel");
const compte = document.querySelector("#compte");
const erreur = form.querySelector(".message-erreur");
const COULEURS = ["#1f3a4d", "#e2b44b", "#f3eee3", "#c2452d", "#4f6b4a", "#7a5434"];
const TEXTE_SUR = { "#e2b44b": "#1a2026", "#f3eee3": "#1f3a4d" };

let telephone = "";
let rotation = 0;

function descriptionLot(a) {
  if (a.article_nom) return a.article_nom;
  if (a.rayon_nom) return `Un article « ${a.rayon_nom} » offert`;
  return `${euros(a.remise_cents)} de remise`;
}

function roueSVG(lots) {
  const n = lots.length;
  const r = 100;
  const parts = lots.map((lot, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x0 = 100 + r * Math.cos(a0), y0 = 100 + r * Math.sin(a0);
    const x1 = 100 + r * Math.cos(a1), y1 = 100 + r * Math.sin(a1);
    const fond = COULEURS[i % COULEURS.length];
    const milieu = ((i + 0.5) / n) * 360;
    const titre = lot.titre.length > 22 ? `${lot.titre.slice(0, 21)}…` : lot.titre;
    return `
      <path d="M100,100 L${x0},${y0} A${r},${r} 0 ${n === 1 ? 1 : 0} 1 ${x1},${y1} Z" fill="${fond}"/>
      <text transform="rotate(${milieu} 100 100)" x="100" y="26" text-anchor="middle"
        font-family="Jost, sans-serif" font-size="7.5" font-weight="500"
        fill="${TEXTE_SUR[fond] ?? "#f3eee3"}">${html(titre)}</text>`;
  }).join("");
  return `
    <div class="roue">
      <svg viewBox="0 0 200 200" role="img" aria-label="Roue des lots">
        <g class="roue__disque" id="disque">${parts}</g>
        <circle cx="100" cy="100" r="99" fill="none" stroke="#1f3a4d" stroke-width="2"/>
        <circle cx="100" cy="100" r="14" fill="#1f3a4d"/>
      </svg>
      <span class="roue__fleche" aria-hidden="true"></span>
    </div>`;
}

function rendre(solde) {
  const pct = Math.min(100, Math.round((solde.points / solde.seuil) * 100));
  const peutTourner = solde.roue_active && solde.points >= solde.seuil && solde.lots.length;
  compte.innerHTML = `
    <div class="bloc bloc--ardoise">
      <h2 class="surtitre surtitre--clair">Votre compteur</h2>
      <p class="grand-numero" style="color:var(--lin)">${solde.points}<span class="surtitre surtitre--clair" style="font-family:var(--sans)"> points</span></p>
      <div class="jauge" role="progressbar" aria-valuemin="0" aria-valuemax="${solde.seuil}" aria-valuenow="${Math.min(solde.points, solde.seuil)}">
        <div class="jauge__plein" style="width:${pct}%"></div>
      </div>
      <p class="info__texte--doux">${peutTourner
        ? "Le palier est atteint : la roue est à vous."
        : `Palier à ${solde.seuil} points.${solde.fidelite_active ? "" : " La fidélité est en pause pour le moment."}`}</p>
    </div>

    ${solde.roue_active && solde.lots.length ? `
    <div class="bloc">
      <h2 class="surtitre">La roue</h2>
      ${roueSVG(solde.lots)}
      <p class="rangee" style="justify-content:center">
        <button class="bouton bouton--beurre" id="tourner" ${peutTourner ? "" : "disabled"}>
          Tourner (−${solde.seuil} points)</button>
      </p>
      <p class="message-info" id="resultat" role="status" hidden></p>
    </div>` : ""}

    <div class="bloc">
      <h2 class="surtitre">Vos lots à utiliser</h2>
      ${solde.avoirs.length ? `
        <ul class="avoirs">${solde.avoirs.map((a) => `
          <li><strong>${html(a.titre)}</strong><br><span class="plat__detail">${html(descriptionLot(a))}</span></li>`).join("")}
        </ul>
        <p class="plat__detail">Un lot par commande, appliqué automatiquement : commandez avec ce numéro de téléphone.</p>`
      : '<p class="plat__detail">Aucun lot pour l\'instant.</p>'}
    </div>`;
  compte.hidden = false;

  const bouton = compte.querySelector("#tourner");
  bouton?.addEventListener("click", () => tourner(solde, bouton));
}

async function tourner(solde, bouton) {
  bouton.disabled = true;
  try {
    const lot = await rpc("roue_tourner", { p_telephone: telephone });
    const n = solde.lots.length;
    // La flèche est en haut : on amène le milieu du lot gagné sous elle,
    // après quelques tours complets.
    const cible = 360 - ((lot.index + 0.5) / n) * 360;
    rotation += 360 * 5 + ((cible - (rotation % 360)) + 360) % 360;
    const disque = compte.querySelector("#disque");
    disque.style.transform = `rotate(${rotation}deg)`;
    await new Promise((ok) => {
      disque.addEventListener("transitionend", ok, { once: true });
      setTimeout(ok, 5000);
    });
    const resultat = compte.querySelector("#resultat");
    resultat.textContent = `Gagné : ${lot.titre}. Il s'appliquera à votre prochaine commande.`;
    resultat.hidden = false;
    setTimeout(() => charger(), 2500);
  } catch (err) {
    const resultat = compte.querySelector("#resultat");
    resultat.textContent = err.message;
    resultat.hidden = false;
    bouton.disabled = false;
  }
}

async function charger() {
  erreur.hidden = true;
  try {
    const solde = await rpc("fidelite_solde", { p_telephone: telephone });
    if (!solde) {
      erreur.textContent = "Ce numéro semble incomplet.";
      erreur.hidden = false;
      return;
    }
    rendre(solde);
  } catch (err) {
    erreur.textContent = err.message;
    erreur.hidden = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  telephone = form.elements.tel.value.trim();
  const client = memoire.lire("ti-mael:client", {});
  memoire.ecrire("ti-mael:client", { ...client, client_tel: telephone });
  charger();
});

const connu = memoire.lire("ti-mael:client", {}).client_tel;
if (connu) {
  form.elements.tel.value = connu;
  telephone = connu;
  charger();
}
