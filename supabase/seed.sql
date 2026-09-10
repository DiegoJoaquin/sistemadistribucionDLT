-- ===========================================================================
-- Semilla para desarrollo local (§2: tres usuarios iniciales).
--
-- Solo corre con `supabase db reset` en local. NO se aplica en producción:
-- allá los usuarios se crean desde el panel de Supabase, con contraseñas que
-- elige cada persona.
--
-- Contraseña de los tres en local: kpis2026
-- ===========================================================================

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  u.email,
  crypt('kpis2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nombre', u.nombre),
  now(),
  now()
from (values
  ('cata@dltsports.cl',    'Catalina'),
  ('matias@dltsports.cl',  'Matías'),
  ('fernanda@dltsports.cl','Fernanda')
) as u(email, nombre)
where not exists (select 1 from auth.users where auth.users.email = u.email);

-- Supabase exige una identidad de tipo email por usuario para poder iniciar
-- sesión con contraseña.
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email in ('cata@dltsports.cl', 'matias@dltsports.cl', 'fernanda@dltsports.cl')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- El trigger crea los perfiles con `autorizado = false`: tener sesión no
-- alcanza para entrar. Los tres usuarios de prueba se habilitan acá.
update public.perfiles
   set autorizado = true
 where email in ('cata@dltsports.cl', 'matias@dltsports.cl', 'fernanda@dltsports.cl');
