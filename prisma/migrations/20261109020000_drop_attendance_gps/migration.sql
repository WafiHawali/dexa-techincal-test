-- Location tracking is not part of the attendance workflow.
ALTER TABLE `attendances`
    DROP COLUMN `latitude`,
    DROP COLUMN `longitude`,
    DROP COLUMN `gps_accuracy`;
