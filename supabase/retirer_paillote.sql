-- Ti Maël se sépare de la Paillote : carte (6 rubriques, 47 plats) et
-- 2 avis supprimés. Une copie reste dans reglages.archive_paillote_donnees.
-- À coller dans Supabase → SQL Editor, puis « Run ».

begin;

insert into reglages (cle, valeur)
select 'archive_paillote_donnees', jsonb_build_object(
  'rayons',   (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from rayons r
                where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee')),
  'articles', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from articles a
                join rayons r on r.id = a.rayon_id
                where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee')),
  'avis',     (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from avis v where v.created_at < '2026-10-07'))
on conflict (cle) do nothing;

-- Les anciennes commandes et lots gardent leur nom et leur prix ;
-- seul le lien vers l'article disparu est retiré.
update lignes_commande set article_id = null
 where article_id in (select a.id from articles a join rayons r on r.id = a.rayon_id
                       where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee'));
update avoirs set article_id = null
 where article_id in (select a.id from articles a join rayons r on r.id = a.rayon_id
                       where r.slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee'));

delete from articles
 where rayon_id in (select id from rayons
                     where slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee'));
delete from rayons
 where slug in ('formules','a-grignoter','faim-de-loup','desserts','se-rafraichir','le-trophee');

delete from avis where created_at < '2026-10-07';

commit;
