// Page d'accueil : carte en direct, état du service, avis, panier et commande.

import {
  carte, rpc, commander, euros, html, heure, joursOuverts, memoire,
} from "./api.js";

const $ = (s, racine = document) => racine.querySelector(s);
const $$ = (s, racine = document) => [...racine.querySelectorAll(s)];

let rubriques = [];          // la carte telle que lue dans la base
const articlesParId = new Map();
let service = null;          // service_etat()
let panier = memoire.lire("ti-mael:panier", []);

/* --------------------------------------------------------------------------
   Carte
   -------------------------------------------------------------------------- */

function titreRubrique(nom) {
  // « Galettes de blé noir » → « Galettes <em>de blé noir</em> » : le premier
  // mot en romain, la suite en italique, comme sur la charte.
  const [premier, ...reste] = nom.split(" ");
  return reste.length
    ? `${html(premier)} <span class="italique">${html(reste.join(" "))}</span>`
    : html(nom);
}

function afficherCarte() {
  const menu = $("#menu");
  menu.innerHTML = rubriques.map((r) => `
    <div class="rubrique${/mer|marée|maree/i.test(r.slug + r.nom) ? " rubrique--mer" : ""}">
      ${/mer|marée|maree/i.test(r.slug + r.nom)
        ? '<div class="rubrique__motif motif--vagues" aria-hidden="true"></div>' : ""}
      <h3 class="rubrique__titre">${titreRubrique(r.nom)}</h3>
      <ul class="rubrique__liste">
        ${r.articles.map((a) => `
          <li class="plat plat--commande">
            <span class="plat__nom">${html(a.nom)}${a.description
              ? `<span class="plat__detail">${html(a.description)}</span>` : ""}</span>
            <span class="plat__prix">${euros(a.prix_cents)}</span>
            <button type="button" class="plat__ajouter" data-ajouter="${a.id}"
              aria-label="Ajouter ${html(a.nom)} au panier">+</button>
          </li>`).join("")}
      </ul>
    </div>`).join("");
}

/* --------------------------------------------------------------------------
   Service, heure mystère, avis
   -------------------------------------------------------------------------- */

function afficherService() {
  if (!service) return;
  const plage = `${heure(service.debut)} – ${heure(service.fin)}`;
  $("[data-service-etat]").textContent = service.ouvert ? "Ouvert" : "Fermé";
  $("[data-service-heures]").textContent = plage;
  if (!service.ouvert && service.message) {
    $("[data-service-message]").textContent = service.message;
  }
  const jours = joursOuverts(service.jours);
  $("[data-horaires-jours]").textContent = jours[0].toUpperCase() + jours.slice(1);
  $("[data-horaires-heures]").textContent = plage;
  if (service.fermeture_longue) {
    $("[data-horaires-note]").textContent = service.message;
  }
}

async function chargerHeureMystere() {
  try {
    const hh = await rpc("happy_hour_etat");
    if (!hh?.actif) return;
    const ligne = $("[data-heure-mystere]");
    $("[data-heure-mystere-texte]").textContent =
      `${hh.mode === "aleatoire" ? "Heure mystère" : "Happy hour"} · ${hh.rayon_nom ?? ""}`;
    $("[data-heure-mystere-prix]").textContent = `−${hh.pourcentage} %`;
    ligne.hidden = false;
  } catch {
    /* pas d'heure mystère affichée : sans gravité */
  }
}

async function chargerAvis() {
  try {
    const avis = (await rpc("avis_publics")).filter((a) => a.commentaire).slice(0, 6);
    if (!avis.length) return;
    $("#avis-liste").innerHTML = avis.map((a) => `
      <figure class="avis">
        <p class="avis__note" aria-label="${a.note} sur 5">${"★".repeat(a.note)}<span>${"★".repeat(5 - a.note)}</span></p>
        <blockquote class="avis__texte">${html(a.commentaire)}</blockquote>
        <figcaption class="avis__auteur">${html(a.prenom || "Un client")}</figcaption>
      </figure>`).join("");
    $("#avis").hidden = false;
    $("[data-numero-infos]").textContent = "04";
  } catch {
    /* la section reste masquée */
  }
}

/* --------------------------------------------------------------------------
   Choix d'un article (variantes, formules, suppléments)
   -------------------------------------------------------------------------- */

const fenetreArticle = $("#fenetre-article");
let articleEnCours = null;
let quantite = 1;

function ouvrirArticle(id) {
  const a = articlesParId.get(id);
  if (!a) return;
  const v = a.variantes || {};
  const supplements = a.supplements || [];
  // Article simple : on l'ajoute directement, sans fenêtre.
  if (!v.valeurs?.length && !v.rayons?.length && !supplements.length) {
    ajouter({ article_id: a.id, quantite: 1, choix: null, supplements: [] });
    return;
  }
  articleEnCours = a;
  quantite = 1;
  $("#article-quantite").textContent = "1";
  $("#article-titre").textContent = a.nom;
  $("#article-description").textContent = a.description || "";

  let options = "";
  if (v.valeurs?.length) {
    options += `
      <fieldset class="champ">
        <legend class="champ__libelle">${html(v.titre || "Choix")}</legend>
        <div class="choix-liste">
          ${v.valeurs.map((val, i) => `
            <label class="choix-liste__option">
              <input type="radio" name="valeur" value="${html(val)}" ${i === 0 ? "checked" : ""}>
              <span>${html(val)}${v.descriptions?.[val]
                ? `<small>${html(v.descriptions[val])}</small>` : ""}</span>
            </label>`).join("")}
        </div>
      </fieldset>`;
  }
  // Une formule propose un article de chacune des rubriques listées.
  for (const slug of v.rayons || []) {
    const r = rubriques.find((x) => x.slug === slug);
    if (!r) continue;
    options += `
      <label class="champ">
        <span class="champ__libelle">${html(r.nom)}</span>
        <select class="champ__saisie" name="rayon-${html(slug)}">
          ${r.articles.filter((x) => !x.variantes?.rayons).map((x) =>
            `<option value="${html(x.nom)}">${html(x.nom)}</option>`).join("")}
        </select>
      </label>`;
  }
  if (supplements.length) {
    options += `
      <fieldset class="champ">
        <legend class="champ__libelle">Suppléments</legend>
        <div class="choix-liste">
          ${supplements.map((s) => `
            <label class="choix-liste__option">
              <input type="checkbox" name="supplement" value="${html(s.nom)}">
              <span>${html(s.nom)} <small>+ ${euros(s.prix_cents)}</small></span>
            </label>`).join("")}
        </div>
      </fieldset>`;
  }
  $("#article-options").innerHTML = options;
  // returnValue survit d'une ouverture à l'autre : sans remise à zéro, un
  // Échap après un ajout ajouterait l'article une seconde fois.
  fenetreArticle.returnValue = "";
  fenetreArticle.showModal();
}

$$("[data-q]", fenetreArticle).forEach((b) => b.addEventListener("click", () => {
  quantite = Math.min(20, Math.max(1, quantite + Number(b.dataset.q)));
  $("#article-quantite").textContent = String(quantite);
}));

fenetreArticle.addEventListener("close", () => {
  if (fenetreArticle.returnValue !== "ajouter" || !articleEnCours) return;
  const form = $("#form-article");
  const a = articleEnCours;
  const parties = [];
  const valeur = form.querySelector("input[name=valeur]:checked")?.value;
  if (valeur) parties.push(valeur);
  for (const slug of a.variantes?.rayons || []) {
    const choix = form.querySelector(`[name="rayon-${CSS.escape(slug)}"]`)?.value;
    if (choix) parties.push(choix);
  }
  const supplements = $$("input[name=supplement]:checked", form).map((x) => x.value);
  ajouter({
    article_id: a.id,
    quantite,
    choix: parties.length ? parties.join(" · ") : null,
    supplements,
  });
  articleEnCours = null;
});

/* --------------------------------------------------------------------------
   Panier
   -------------------------------------------------------------------------- */

function prixLigne(l) {
  const a = articlesParId.get(l.article_id);
  if (!a) return 0;
  const supp = (a.supplements || [])
    .filter((s) => l.supplements.includes(s.nom))
    .reduce((t, s) => t + s.prix_cents, 0);
  return (a.prix_cents + supp) * l.quantite;
}

function ajouter(ligne) {
  const cle = (l) => `${l.article_id}|${l.choix ?? ""}|${[...l.supplements].sort().join(",")}`;
  const existante = panier.find((l) => cle(l) === cle(ligne));
  if (existante) existante.quantite = Math.min(20, existante.quantite + ligne.quantite);
  else panier.push(ligne);
  sauverPanier();
}

function sauverPanier() {
  // Un article retiré de la carte entre-temps disparaît du panier.
  panier = panier.filter((l) => articlesParId.has(l.article_id) && l.quantite > 0);
  memoire.ecrire("ti-mael:panier", panier);
  afficherPanier();
}

function afficherPanier() {
  const nombre = panier.reduce((t, l) => t + l.quantite, 0);
  const total = panier.reduce((t, l) => t + prixLigne(l), 0);
  $("#panier-barre").hidden = nombre === 0;
  document.body.classList.toggle("avec-panier", nombre > 0);
  $("[data-panier-nombre]").textContent = String(nombre);
  $("[data-panier-mot]").textContent = nombre > 1 ? "articles" : "article";
  $$("[data-panier-total]").forEach((x) => { x.textContent = euros(total); });
  $("#panier-lignes").innerHTML = panier.map((l, i) => {
    const a = articlesParId.get(l.article_id);
    const detail = [l.choix, ...l.supplements.map((s) => `+ ${s}`)].filter(Boolean).join(" · ");
    return `
      <li class="panier-ligne">
        <span class="panier-ligne__nom">${html(a?.nom)}${detail
          ? `<small>${html(detail)}</small>` : ""}</span>
        <span class="quantite quantite--petite">
          <button type="button" class="quantite__bouton" data-ligne="${i}" data-delta="-1" aria-label="Un de moins">−</button>
          <output class="quantite__valeur">${l.quantite}</output>
          <button type="button" class="quantite__bouton" data-ligne="${i}" data-delta="1" aria-label="Un de plus">+</button>
        </span>
        <span class="panier-ligne__prix">${euros(prixLigne(l))}</span>
      </li>`;
  }).join("");
  if (!nombre && fenetrePanier.open) fenetrePanier.close();
}

const fenetrePanier = $("#fenetre-panier");
const formPanier = $("#form-panier");

$("[data-ouvrir-panier]").addEventListener("click", () => {
  const client = memoire.lire("ti-mael:client", {});
  for (const [cle, valeur] of Object.entries(client)) {
    if (formPanier.elements[cle] && !formPanier.elements[cle].value) {
      formPanier.elements[cle].value = valeur;
    }
  }
  if (service?.debut) formPanier.elements.heure_souhaitee.min = service.debut;
  if (service?.fin) formPanier.elements.heure_souhaitee.max = service.fin;
  $("#panier-erreur").hidden = true;
  fenetrePanier.showModal();
});
$("[data-fermer]", fenetrePanier).addEventListener("click", () => fenetrePanier.close());
$("[data-vider]", fenetrePanier).addEventListener("click", () => {
  panier = [];
  sauverPanier();
});
$("#panier-lignes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ligne]");
  if (!b) return;
  panier[Number(b.dataset.ligne)].quantite += Number(b.dataset.delta);
  sauverPanier();
});
formPanier.addEventListener("change", (e) => {
  if (e.target.name === "mode") {
    $("[data-champ-table]").hidden = e.target.value !== "sur_place";
  }
});

function erreurPanier(message) {
  const p = $("#panier-erreur");
  p.textContent = message;
  p.hidden = false;
}

formPanier.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formPanier.elements;
  const client_nom = f.client_nom.value.trim();
  if (!client_nom) {
    erreurPanier("Indiquez un prénom : c'est lui qu'on appellera.");
    f.client_nom.focus();
    return;
  }
  const bouton = $("#panier-valider");
  bouton.disabled = true;
  bouton.textContent = "Envoi…";
  try {
    const mode = f.mode.value;
    const reponse = await commander({
      lignes: panier.map(({ article_id, quantite: q, choix, supplements }) =>
        ({ article_id, quantite: q, choix, supplements })),
      mode,
      table_numero: mode === "sur_place" ? f.table_numero.value.trim() : null,
      client_nom,
      client_tel: f.client_tel.value.trim(),
      heure_souhaitee: f.heure_souhaitee.value || null,
      note: f.note.value.trim(),
    });
    memoire.ecrire("ti-mael:client", {
      client_nom, client_tel: f.client_tel.value.trim(),
    });
    memoire.ecrire(`ti-mael:commande:${reponse.jeton}`, reponse);
    const commandes = memoire.lire("ti-mael:commandes", []);
    memoire.ecrire("ti-mael:commandes", [reponse.jeton, ...commandes].slice(0, 10));
    panier = [];
    sauverPanier();
    location.href = `suivi.html?c=${encodeURIComponent(reponse.jeton)}`;
  } catch (err) {
    // Articles devenus indisponibles : on les retire et on prévient.
    const absents = err.corps?.articles_indisponibles;
    if (absents?.length) {
      panier = panier.filter((l) => !absents.includes(l.article_id));
      sauverPanier();
    }
    erreurPanier(err.message || "La commande n'est pas partie. Réessayez.");
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Commander";
  }
});

/* --------------------------------------------------------------------------
   Démarrage
   -------------------------------------------------------------------------- */

$("#menu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ajouter]");
  if (b) ouvrirArticle(b.dataset.ajouter);
});

(async () => {
  try {
    rubriques = await carte();
    for (const r of rubriques) for (const a of r.articles) articlesParId.set(a.id, a);
    if (rubriques.length) afficherCarte();
    sauverPanier();
  } catch {
    // La carte fixe reste affichée, sans commande en ligne.
    $("#panier-barre").hidden = true;
  }
})();

rpc("service_etat").then((s) => { service = s; afficherService(); }).catch(() => {});
chargerHeureMystere();
chargerAvis();
