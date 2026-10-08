// Accès à la base Supabase de Ti Maël.
//
// La clé ci-dessous est la clé publique « anon » : elle est faite pour être
// dans le navigateur. Tout ce qui compte (prix, remises, points, accès
// cuisine) est vérifié côté base — RLS, fonctions SECURITY DEFINER avec PIN,
// et la fonction Edge `commander` qui recalcule chaque addition.

export const SUPABASE_URL = "https://qhavgcbckxswmhxauavy.supabase.co";
export const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYXZnY2Jja3hzd21oeGF1YXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTYwNjksImV4cCI6MjEwMjAzMjA2OX0.Iqm0nvBMCd7SHgkRrHGf1LnFewszarCJJLVKF8ZWSqU";

const ENTETES = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
};

async function lire(reponse) {
  const texte = await reponse.text();
  const corps = texte ? JSON.parse(texte) : null;
  if (!reponse.ok) {
    const message = corps?.erreur || corps?.message || "Une erreur est survenue.";
    const erreur = new Error(message);
    erreur.corps = corps;
    erreur.statut = reponse.status;
    throw erreur;
  }
  return corps;
}

/** Appelle une fonction SQL exposée (`/rest/v1/rpc/<nom>`). */
export async function rpc(nom, parametres = {}) {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: ENTETES,
    body: JSON.stringify(parametres),
  });
  return lire(reponse);
}

/** La carte publique : rubriques et articles disponibles, dans l'ordre. */
export async function carte() {
  const champs =
    "id,slug,nom,position,articles(id,nom,description,prix_cents,position,disponible,variantes,supplements,debloque_par_roue)";
  const reponse = await fetch(
    `${SUPABASE_URL}/rest/v1/rayons?select=${champs}&order=position,nom`,
    { headers: ENTETES },
  );
  const rayons = await lire(reponse);
  for (const r of rayons) {
    r.articles = (r.articles || [])
      .filter((a) => a.disponible && !a.debloque_par_roue)
      .sort((a, b) => a.position - b.position || a.nom.localeCompare(b.nom, "fr"));
  }
  return rayons.filter((r) => r.articles.length);
}

/** Passe une commande : la fonction Edge recalcule tout côté serveur. */
export async function commander(commande) {
  const reponse = await fetch(`${SUPABASE_URL}/functions/v1/commander`, {
    method: "POST",
    headers: ENTETES,
    body: JSON.stringify(commande),
  });
  return lire(reponse);
}

/** 1250 → « 12,50 € » ; 1200 → « 12 € » (sans centime superflu). */
export function euros(cents) {
  const v = (cents || 0) / 100;
  return Number.isInteger(v)
    ? `${v} €`
    : `${v.toFixed(2).replace(".", ",")} €`;
}

/** Échappe un texte avant de l'insérer dans du HTML. */
export function html(texte) {
  return String(texte ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/**
 * La fidélité passe par le numéro de téléphone (9 chiffres au moins, comme
 * le vérifie la base). Renvoie un message si la saisie n'en est pas un,
 * null sinon — un champ vide est accepté : on commande sans points.
 */
export function problemeTelephone(saisie) {
  const v = (saisie || "").trim();
  if (!v) return null;
  if (v.includes("@")) {
    return "C'est une adresse e-mail : les points se cumulent avec un numéro de téléphone (10 chiffres).";
  }
  if (v.replace(/\D/g, "").length < 9) {
    return "Ce numéro est incomplet : il faut 10 chiffres, par exemple 06 12 34 56 78.";
  }
  return null;
}

export const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « 12:00 » → « 12 h » ; « 12:30 » → « 12 h 30 ». */
export function heure(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** Résume les jours d'ouverture : « tous les jours », « du mardi au dimanche »… */
export function joursOuverts(jours) {
  const j = [...new Set(jours || [])].sort((a, b) => a - b);
  if (j.length === 7) return "tous les jours";
  if (!j.length) return "sur rendez-vous";
  // On cherche une suite continue, en partant de lundi (1) jusqu'à dimanche (0 → 7).
  const lundiDabord = j.map((x) => (x === 0 ? 7 : x)).sort((a, b) => a - b);
  const continu = lundiDabord.every((x, i) => i === 0 || x === lundiDabord[i - 1] + 1);
  const nom = (x) => JOURS[x % 7];
  if (continu && lundiDabord.length > 2) {
    return `du ${nom(lundiDabord[0])} au ${nom(lundiDabord.at(-1))}`;
  }
  const fermes = [0, 1, 2, 3, 4, 5, 6].filter((x) => !j.includes(x));
  if (fermes.length === 1) return `tous les jours sauf le ${JOURS[fermes[0]]}`;
  return lundiDabord.map(nom).join(", ");
}

export const STATUTS = {
  recue: "Reçue",
  en_preparation: "Sur la bilig",
  prete: "Prête",
  servie: "Servie",
  annulee: "Annulée",
};

/** Petit stockage local tolérant (navigation privée, stockage bloqué). */
export const memoire = {
  lire(cle, defaut = null) {
    try {
      const v = localStorage.getItem(cle);
      return v === null ? defaut : JSON.parse(v);
    } catch {
      return defaut;
    }
  },
  ecrire(cle, valeur) {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
      /* stockage indisponible : tant pis, rien de vital */
    }
  },
  oublier(cle) {
    try {
      localStorage.removeItem(cle);
    } catch {
      /* idem */
    }
  },
};
