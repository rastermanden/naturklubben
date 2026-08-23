-- Billeder uploadet før 20260823161000_gallery_upload_status.sql fik status
-- 'failed' i den migrations backfill, når de manglede optimerede filer (#100).
-- Intet var dog fejlet: rækkerne er ældre end optimeringsstatus overhovedet
-- fandtes, så de blev aldrig forsøgt optimeret. Resultatet var et rødt
-- "Optimering fejlede — Billedet blev uploadet før sikker optimeringsstatus
-- blev indført." på hvert gammelt billede i galleriet.
--
-- 'pending' er den sandfærdige status for et billede, der venter på sit første
-- optimeringsforsøg. Klienten sætter dem selv i gang (se
-- useAutoOptimizePendingPhotos), og claim_photo_optimization accepterer
-- 'pending', så de heler sig selv i stedet for at stå som fejl for evigt.
--
-- Sætningen rammer kun rækker, som netop den backfill har markeret: teksten
-- sættes intet andet sted, og et rigtigt fejlet forsøg har talt
-- optimization_attempts op. Kørt igen ændrer den nul rækker.
update public.photos
set optimization_status = 'pending',
    optimization_error = null,
    optimization_started_at = null,
    optimization_completed_at = null
where optimization_status = 'failed'
  and optimization_attempts = 0
  and optimization_error =
    'Billedet blev uploadet før sikker optimeringsstatus blev indført.';
