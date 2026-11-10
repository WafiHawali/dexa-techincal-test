-- Distinguish the check-in selfie from the clock-out selfie.
ALTER TABLE `attendance_photos`
    ADD COLUMN `kind` ENUM('CHECK_IN', 'CHECK_OUT') NOT NULL DEFAULT 'CHECK_IN';

-- One check-in photo and one clock-out photo per attendance.
CREATE UNIQUE INDEX `attendance_photos_attendance_id_kind_key`
    ON `attendance_photos`(`attendance_id`, `kind`);
