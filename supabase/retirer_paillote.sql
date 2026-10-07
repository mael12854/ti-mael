-- Ti Maël se sépare de la Paillote : carte (6 rubriques, 47 plats), avis,
-- commandes, points de fidélité, lots et numéro de démo supprimés.
-- Une copie de tout reste dans reglages.archive_paillote_donnees.
-- À coller dans Supabase → SQL Editor, puis « Run ». Tout ou rien.

begin;

insert into reglages (cle, valeur)
select 'archive_paillote_donnees', jsonb_build_object(
  'rayons',          (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from rayons r
                       where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee')),
  'articles',        (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from articles a
                       join rayons r on r.id = a.rayon_id
                       where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee')),
  'avis',            (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from avis x where x.created_at < '2026-10-07'),
  'commandes',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from commandes x where x.created_at < '2026-10-07'),
  'lignes_commande', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from lignes_commande l
                       join commandes c on c.id = l.commande_id where c.created_at < '2026-10-07'),
  'avoirs',          (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from avoirs x where x.gagne_le < '2026-10-07'),
  'fidelite',        (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from fidelite x where x.created_at < '2026-10-07'),
  'numeros_demo',    (select valeur from reglages where cle = 'numeros_demo'))
on conflict (cle) do nothing;

-- Dans l'ordre des dépendances : avis et lots pointent vers les commandes,
-- les lignes vers les commandes et les articles.
delete from avis      where created_at < '2026-10-07';
delete from avoirs    where gagne_le   < '2026-10-07';
delete from lignes_commande
 where commande_id in (select id from commandes where created_at < '2026-10-07');
delete from commandes where created_at < '2026-10-07';
delete from fidelite  where created_at < '2026-10-07';

-- Une ligne de commande plus récente qui viserait encore un plat de la
-- Paillote garde son nom et son prix ; seul le lien est retiré.
update lignes_commande set article_id = null
 where article_id in (select a.id from articles a join rayons r on r.id = a.rayon_id
                       where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee'));
delete from articles
 where rayon_id in (select id from rayons
                     where slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee'));
delete from rayons
 where slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee');

-- Le numéro de démo (0600000000 rechargé à 1234 points) n'a plus lieu d'être.
delete from reglages where cle = 'numeros_demo';

commit;
