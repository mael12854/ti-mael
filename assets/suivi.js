// Suivi d'une commande : numéro, avancement en direct, addition, puis avis.

import { rpc, euros, html, heure, memoire, STATUTS } from "./api.js";

const zone = document.querySelector("#suivi");
const jeton = new URLSearchParams(location.search).get("c")
  || memoire.lire("ti-mael:commandes", [])[0];

const ETAPES = ["recue", "en_preparation", "prete", "servie"];
const PHRASES = {
  recue: "Bien reçue. La bilig chauffe.",
  en_preparation: "C'est sur la bilig.",
  prete: "C'est prêt : on vous appelle par votre numéro.",
  servie: "Bon appétit.",
  annulee: "Cette commande a été annulée. Passez nous voir au comptoir.",
};

let facture = null;
let dernierStatut = null;
let avisEnvoye = false;

function rendre(suivi) {
  const etape = ETAPES.indexOf(suivi.statut);
  const enregistree = memoire.lire(`ti-mael:commande:${jeton}`, {});
  const fidelite = enregistree.fidelite;
  const lignes = facture?.lignes ?? enregistree.lignes ?? [];

  zone.innerHTML = `
    <p class="mention">Votre commande</p>
    <div class="rangee" style="align-items:flex-end;justify-content:space-between">
      <p class="grand-numero" aria-label="Numéro ${suivi.numero_jour}">n° ${suivi.numero_jour}</p>
      <p class="surtitre surtitre--gris">${suivi.mode === "a_emporter" ? "À emporter" : "Sur place"}${
        suivi.heure_souhaitee ? ` · pour ${heure(suivi.heure_souhaitee)}` : ""}</p>
    </div>
    <p class="chapo" style="margin:0">${PHRASES[suivi.statut] ?? ""}</p>

    ${suivi.statut === "annulee" ? "" : `
    <ol class="etapes" aria-label="Avancement">
      ${ETAPES.map((s, i) => `
        <li class="etape ${i < etape ? "etape--faite" : i === etape ? "etape--en-cours" : ""}"
            ${i === etape ? 'aria-current="step"' : ""}>${STATUTS[s]}</li>`).join("")}
    </ol>`}

    <div class="bloc">
      <h2 class="surtitre">L'addition</h2>
      <ul class="lignes-commande">
        ${lignes.map((l) => `
          <li><span>${l.quantite} × ${html(l.nom)}</span><span>${euros(l.prix_cents * l.quantite)}</span></li>`).join("")}
      </ul>
      ${facture?.remise_cents ? `<p class="plat__detail">${html(facture.remise_detail)}</p>` : ""}
      <p class="panier-total"><span>Total</span><strong>${euros(suivi.total_cents)}</strong></p>
      <p class="plat__detail">${suivi.statut_paiement === "paye"
        ? "Réglé, merci." : "À régler au comptoir."}</p>
    </div>

    ${fidelite ? `
    <div class="bloc bloc--ardoise">
      <h2 class="surtitre surtitre--clair">Fidélité</h2>
      <p>+ ${fidelite.points_gagnes} points · ${fidelite.points} au compteur.</p>
      ${fidelite.roue_prete
        ? '<p><a class="bouton bouton--beurre" href="fidelite.html">Tourner la roue</a></p>'
        : `<p class="info__texte--doux">Encore ${Math.max(0, fidelite.seuil - fidelite.points)} points avant de tourner la roue.</p>`}
    </div>` : ""}

    <div id="zone-avis"></div>

    <p><a class="bouton bouton--contour" href="./#carte">Recommander</a></p>`;

  if (suivi.statut === "servie") rendreAvis();
}

function rendreAvis() {
  const cible = document.querySelector("#zone-avis");
  if (avisEnvoye || memoire.lire(`ti-mael:avis:${jeton}`)) {
    cible.innerHTML = '<p class="message-info">Merci pour votre avis.</p>';
    return;
  }
  cible.innerHTML = `
    <form class="bloc" id="form-avis">
      <h2 class="surtitre">Votre avis</h2>
      <fieldset class="champ">
        <legend class="champ__libelle">Votre note</legend>
        <div class="etoiles">
          ${[5, 4, 3, 2, 1].map((n) => `
            <input type="radio" name="note" id="note-${n}" value="${n}" ${n === 5 ? "checked" : ""}>
            <label for="note-${n}" aria-label="${n} sur 5">★</label>`).join("")}
        </div>
      </fieldset>
      <label class="champ">
        <span class="champ__libelle">Un mot <span class="champ__facultatif">facultatif</span></span>
        <textarea class="champ__saisie" name="commentaire" maxlength="300" rows="3"></textarea>
      </label>
      <p class="message-erreur" role="alert" hidden></p>
      <p><button class="bouton bouton--ardoise">Envoyer</button></p>
    </form>`;
  const form = cible.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = form.querySelector("button");
    bouton.disabled = true;
    try {
      await rpc("avis_deposer", {
        p_jeton: jeton,
        p_note: Number(form.elements.note.value),
        p_commentaire: form.elements.commentaire.value,
      });
      avisEnvoye = true;
      memoire.ecrire(`ti-mael:avis:${jeton}`, true);
      rendreAvis();
    } catch (err) {
      const p = form.querySelector(".message-erreur");
      p.textContent = err.message;
      p.hidden = false;
      bouton.disabled = false;
    }
  });
}

async function actualiser() {
  try {
    const [suivi] = await rpc("suivi_commande", { p_jeton: jeton });
    if (!suivi) {
      zone.innerHTML = `
        <p class="mention">Votre commande</p>
        <p class="message-info">Cette commande est introuvable ou date de plus d'un jour.</p>
        <p><a class="bouton bouton--ardoise" href="./#carte">Voir la carte</a></p>`;
      return false;
    }
    if (!facture || suivi.statut !== dernierStatut) {
      facture = await rpc("facture_commande", { p_jeton: jeton }).catch(() => facture);
    }
    // On ne redessine que si quelque chose a changé : le formulaire d'avis
    // en cours de saisie n'est pas effacé toutes les 5 secondes.
    if (suivi.statut !== dernierStatut || !zone.querySelector(".grand-numero")) {
      dernierStatut = suivi.statut;
      rendre(suivi);
    }
    return !["servie", "annulee"].includes(suivi.statut);
  } catch {
    return true; // réseau capricieux : on réessaie
  }
}

if (!jeton) {
  zone.innerHTML = `
    <p class="mention">Votre commande</p>
    <p class="message-info">Aucune commande en cours sur cet appareil.</p>
    <p><a class="bouton bouton--ardoise" href="./#carte">Voir la carte</a></p>`;
} else {
  const boucle = async () => {
    if (await actualiser()) setTimeout(boucle, 5000);
  };
  boucle();
}
