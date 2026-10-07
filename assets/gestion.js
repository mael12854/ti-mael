// Gestion : carte, horaires, remises, roue et avis.

import { euros, html, JOURS } from "./api.js";
import { appel, porte, onglets, signaler } from "./equipe.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let rubriques = [];   // admin_carte()
let reglages = {};    // admin_reglages()

const versCents = (v) => Math.round(Number(String(v).replace(",", ".")) * 100);
const versEuros = (c) => String((c ?? 0) / 100).replace(".", ",");

/* --------------------------------------------------------------------------
   La carte
   -------------------------------------------------------------------------- */

async function chargerCarte() {
  rubriques = await appel("admin_carte");
  $("#carte-rubriques").innerHTML = rubriques.map((r) => `
    <div class="bloc" data-rubrique="${r.id}">
      <form class="rangee rangee--rubrique" data-form-rubrique>
        <input class="champ__saisie champ__saisie--titre" name="nom" value="${html(r.nom)}" aria-label="Nom de la rubrique" required>
        <input class="champ__saisie champ__saisie--court" name="position" type="number" value="${r.position}" aria-label="Ordre">
        <button class="bouton bouton--petit bouton--contour">Renommer</button>
        <button type="button" class="bouton bouton--petit bouton--ardoise" data-nouveau-plat>+ Plat</button>
      </form>
      ${r.articles.length ? `
      <ul class="liste-plats">
        ${r.articles.map((a) => `
          <li class="${a.disponible ? "" : "liste-plats--epuise"}">
            <button type="button" class="liste-plats__bouton" data-plat="${a.id}">
              <span>${html(a.nom)}${a.disponible ? "" : " <small>(indisponible)</small>"}${
                a.debloque_par_roue ? " <small>(lot de la roue)</small>" : ""}${
                a.variantes ? " <small>· choix</small>" : ""}${
                a.supplements ? " <small>· suppléments</small>" : ""}</span>
              <span>${euros(a.prix_cents)}</span>
            </button>
          </li>`).join("")}
      </ul>` : '<p class="plat__detail">Rubrique vide : elle n\'apparaît pas sur le site.</p>'}
    </div>`).join("");

  // Listes de rubriques réutilisées ailleurs (heure mystère, tampons, roue).
  const options = rubriques.map((r) => `<option value="${html(r.slug)}">${html(r.nom)}</option>`).join("");
  $$("[data-liste-rubriques]").forEach((s) => {
    const v = s.value;
    s.innerHTML = options;
    if (v) s.value = v;
  });
}

$("#carte-rubriques").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.closest("[data-rubrique]").dataset.rubrique;
  try {
    await appel("admin_sauver_rayon", {
      p_id: id, p_nom: form.elements.nom.value, p_position: Number(form.elements.position.value) || 0,
    });
    signaler("Rubrique enregistrée.");
    await chargerCarte();
  } catch (err) { signaler(err.message, true); }
});

$("#carte-rubriques").addEventListener("click", (e) => {
  const plat = e.target.closest("[data-plat]");
  if (plat) ouvrirPlat(plat.dataset.plat);
  const nouveau = e.target.closest("[data-nouveau-plat]");
  if (nouveau) ouvrirPlat(null, nouveau.closest("[data-rubrique]").dataset.rubrique);
});

$("#form-nouvelle-rubrique").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    await appel("admin_sauver_rayon", { p_id: null, p_nom: f.nom.value, p_position: Number(f.position.value) || 0 });
    e.target.reset();
    signaler("Rubrique ajoutée.");
    await chargerCarte();
  } catch (err) { signaler(err.message, true); }
});

/* Fiche plat ------------------------------------------------------------- */

const fenetre = $("#fenetre-plat");
const formPlat = $("#form-plat");

function ouvrirPlat(id, rubriqueId) {
  const tous = rubriques.flatMap((r) => r.articles.map((a) => ({ ...a, rayon_id: r.id })));
  const a = id ? tous.find((x) => x.id === id) : null;
  const f = formPlat.elements;
  formPlat.reset();
  $(".message-erreur", formPlat).hidden = true;
  $("#plat-titre").textContent = a ? a.nom : "Nouveau plat";
  $("#plat-rubrique").innerHTML = rubriques.map((r) =>
    `<option value="${r.id}">${html(r.nom)}</option>`).join("");
  $("#plat-formule").innerHTML = rubriques.map((r) => `
    <label class="interrupteur"><input type="checkbox" name="formule" value="${html(r.slug)}"
      ${a?.variantes?.rayons?.includes(r.slug) ? "checked" : ""}><span>${html(r.nom)}</span></label>`).join("");

  f.id.value = a?.id ?? "";
  f.nom.value = a?.nom ?? "";
  f.prix.value = a ? a.prix_cents / 100 : "";
  f.description.value = a?.description ?? "";
  f.rayon_id.value = a?.rayon_id ?? rubriqueId ?? rubriques[0]?.id ?? "";
  f.position.value = a?.position ?? 0;
  f.disponible.checked = a ? a.disponible : true;
  f.debloque_par_roue.checked = !!a?.debloque_par_roue;
  f.variante_titre.value = a?.variantes?.titre ?? "";
  f.variante_valeurs.value = (a?.variantes?.valeurs ?? []).map((v) =>
    a.variantes.descriptions?.[v] ? `${v} : ${a.variantes.descriptions[v]}` : v).join("\n");
  f.supplements.value = (a?.supplements ?? []).map((s) =>
    `${s.nom} ; ${versEuros(s.prix_cents)}`).join("\n");
  $$("details", formPlat).forEach((d) => {
    d.open = !!d.querySelector("textarea")?.value || !!d.querySelector("input:checked");
  });
  $("[data-supprimer]", formPlat).hidden = !a;
  fenetre.showModal();
}

$("[data-fermer]", fenetre).addEventListener("click", () => fenetre.close());

formPlat.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formPlat.elements;
  const valeurs = [];
  const descriptions = {};
  for (const ligne of f.variante_valeurs.value.split("\n")) {
    const [nom, ...desc] = ligne.split(":");
    if (!nom.trim()) continue;
    valeurs.push(nom.trim());
    if (desc.join(":").trim()) descriptions[nom.trim()] = desc.join(":").trim();
  }
  const formule = $$("input[name=formule]:checked", formPlat).map((x) => x.value);
  const supplements = f.supplements.value.split("\n")
    .map((l) => l.split(";"))
    .filter(([nom, prix]) => nom?.trim() && prix?.trim())
    .map(([nom, prix]) => ({ nom: nom.trim(), prix_cents: versCents(prix) }));

  try {
    await appel("admin_sauver_article", {
      p_id: f.id.value || null,
      p_rayon_id: f.rayon_id.value,
      p_nom: f.nom.value,
      p_description: f.description.value,
      p_prix_cents: versCents(f.prix.value),
      p_disponible: f.disponible.checked,
      p_position: Number(f.position.value) || 0,
      p_variantes: valeurs.length || formule.length
        ? { titre: f.variante_titre.value, valeurs, descriptions, rayons: formule }
        : null,
      p_debloque_par_roue: f.debloque_par_roue.checked,
      p_supplements: supplements.length ? supplements : null,
    });
    fenetre.close();
    signaler("Plat enregistré.");
    await chargerCarte();
  } catch (err) {
    const p = $(".message-erreur", formPlat);
    p.textContent = err.message;
    p.hidden = false;
  }
});

$("[data-supprimer]", formPlat).addEventListener("click", async () => {
  if (!confirm("Supprimer ce plat ? S'il figure dans d'anciennes commandes, il sera seulement retiré de la carte.")) return;
  try {
    await appel("admin_supprimer_article", { p_id: formPlat.elements.id.value });
    fenetre.close();
    signaler("Plat supprimé.");
    await chargerCarte();
  } catch (err) { signaler(err.message, true); }
});

/* --------------------------------------------------------------------------
   Réglages
   -------------------------------------------------------------------------- */

async function chargerReglages() {
  reglages = await appel("admin_reglages");

  const s = reglages.service ?? {};
  const fs = $("#form-service").elements;
  const mode = $(`#form-service input[name=mode][value="${s.mode ?? "auto"}"]`);
  if (mode) mode.checked = true;
  fs.debut.value = s.debut ?? "12:00";
  fs.fin.value = s.fin ?? "22:00";
  fs.message.value = s.message ?? "";
  fs.message_saison.value = s.message_saison ?? "";
  // Lundi d'abord, dimanche à la fin.
  $("#cases-jours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((j) => `
    <label class="interrupteur"><input type="checkbox" name="jours" value="${j}"
      ${(s.jours ?? []).includes(j) ? "checked" : ""}><span>${JOURS[j]}</span></label>`).join("");

  for (const form of $$("[data-reglage]")) {
    const valeur = reglages[form.dataset.reglage] ?? {};
    for (const champ of form.elements) {
      if (!champ.name || !(champ.name in valeur)) continue;
      if (champ.type === "checkbox") champ.checked = !!valeur[champ.name];
      else champ.value = valeur[champ.name];
    }
  }
  chargerRoue();
}

$("#form-service").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    await appel("admin_sauver_service", {
      p_valeur: {
        mode: $("#form-service input[name=mode]:checked")?.value ?? "auto",
        debut: f.debut.value,
        fin: f.fin.value,
        jours: $$("#cases-jours input:checked").map((x) => Number(x.value)),
        message: f.message.value,
        message_saison: f.message_saison.value,
      },
    });
    signaler("Horaires enregistrés.");
  } catch (err) { signaler(err.message, true); }
});

$$("[data-reglage]").forEach((form) => form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const valeur = {};
  for (const champ of form.elements) {
    if (!champ.name) continue;
    valeur[champ.name] = champ.type === "checkbox" ? champ.checked
      : champ.type === "number" || champ.type === "hidden" ? Number(champ.value)
      : champ.value;
  }
  try {
    await appel("admin_sauver_reglage", { p_cle: form.dataset.reglage, p_valeur: valeur });
    signaler("Réglage enregistré.");
  } catch (err) { signaler(err.message, true); }
}));

/* La roue ---------------------------------------------------------------- */

function ligneLot(lot = {}) {
  const type = lot.article_id ? "article" : lot.rayon_slug ? "rayon" : "euros";
  const articles = rubriques.flatMap((r) => r.articles);
  return `
    <tr>
      <td><input class="champ__saisie" name="titre" value="${html(lot.titre ?? "")}" required aria-label="Titre"></td>
      <td><select class="champ__saisie" name="type" aria-label="Type">
        <option value="euros" ${type === "euros" ? "selected" : ""}>Remise en €</option>
        <option value="rayon" ${type === "rayon" ? "selected" : ""}>Un plat d'une rubrique</option>
        <option value="article" ${type === "article" ? "selected" : ""}>Un plat précis</option>
      </select></td>
      <td>
        <select class="champ__saisie" name="rayon_slug" aria-label="Rubrique" ${type === "rayon" ? "" : "hidden"}>
          ${rubriques.map((r) => `<option value="${html(r.slug)}" ${r.slug === lot.rayon_slug ? "selected" : ""}>${html(r.nom)}</option>`).join("")}
        </select>
        <select class="champ__saisie" name="article_id" aria-label="Plat" ${type === "article" ? "" : "hidden"}>
          ${articles.map((a) => `<option value="${a.id}" ${a.id === lot.article_id ? "selected" : ""}>${html(a.nom)}</option>`).join("")}
        </select>
      </td>
      <td><input class="champ__saisie champ__saisie--court" name="remise" value="${versEuros(lot.remise_cents ?? 200)}" inputmode="decimal" aria-label="Remise en euros"></td>
      <td><input class="champ__saisie champ__saisie--court" name="poids" type="number" min="1" max="100" value="${lot.poids ?? 1}" aria-label="Poids"></td>
      <td><button type="button" class="bouton bouton--petit bouton--texte" data-retirer aria-label="Retirer ce lot">×</button></td>
    </tr>`;
}

function chargerRoue() {
  const roue = reglages.roue ?? { actif: false, lots: [] };
  $("#form-roue").elements.actif.checked = !!roue.actif;
  $("#lots").innerHTML = (roue.lots.length ? roue.lots : [{}]).map(ligneLot).join("");
}

$("#lots").addEventListener("change", (e) => {
  if (e.target.name !== "type") return;
  const tr = e.target.closest("tr");
  tr.querySelector("[name=rayon_slug]").hidden = e.target.value !== "rayon";
  tr.querySelector("[name=article_id]").hidden = e.target.value !== "article";
});
$("#lots").addEventListener("click", (e) => {
  if (e.target.closest("[data-retirer]")) e.target.closest("tr").remove();
});
$("#ajouter-lot").addEventListener("click", () => {
  $("#lots").insertAdjacentHTML("beforeend", ligneLot());
});

$("#form-roue").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lots = $$("#lots tr").map((tr) => {
    const v = (n) => tr.querySelector(`[name=${n}]`).value;
    const type = v("type");
    return {
      titre: v("titre"),
      remise_cents: Math.max(1, versCents(v("remise"))),
      poids: Number(v("poids")) || 1,
      article_id: type === "article" ? v("article_id") : null,
      rayon_slug: type === "rayon" ? v("rayon_slug") : null,
    };
  });
  try {
    await appel("admin_sauver_roue", {
      p_valeur: { actif: e.target.elements.actif.checked, lots },
    });
    signaler("Roue enregistrée.");
    reglages = await appel("admin_reglages");
  } catch (err) { signaler(err.message, true); }
});

/* --------------------------------------------------------------------------
   Avis
   -------------------------------------------------------------------------- */

async function chargerAvis() {
  const avis = await appel("admin_avis");
  $("#liste-avis").innerHTML = avis.length ? avis.map((a) => `
    <div class="bloc avis-gestion" data-avis="${a.id}">
      <p class="avis__note">${"★".repeat(a.note)}<span>${"★".repeat(5 - a.note)}</span>
        <small class="plat__detail">${html(a.prenom || "Anonyme")} · ${new Date(a.quand).toLocaleDateString("fr-FR")}</small></p>
      ${a.commentaire ? `<p>${html(a.commentaire)}</p>` : ""}
      <p class="plat__detail">${(a.articles ?? []).map(html).join(" · ")}</p>
      <p><button class="bouton bouton--petit bouton--texte" data-supprimer-avis>Supprimer cet avis</button></p>
    </div>`).join("") : '<p class="message-info">Aucun avis pour l\'instant.</p>';
}

$("#liste-avis").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-supprimer-avis]");
  if (!b || !confirm("Supprimer cet avis du site ?")) return;
  try {
    await appel("admin_supprimer_avis", { p_id: b.closest("[data-avis]").dataset.avis });
    signaler("Avis supprimé.");
    await chargerAvis();
  } catch (err) { signaler(err.message, true); }
});

/* Démarrage --------------------------------------------------------------- */

porte({
  verifier: "admin_reglages",
  async demarrer() {
    onglets((nom) => { if (nom === "avis") chargerAvis().catch((err) => signaler(err.message, true)); });
    try {
      await chargerCarte();
      await chargerReglages();
    } catch (err) {
      signaler(err.message, true);
    }
  },
});
