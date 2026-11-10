-- Clock-out is optional and recorded once per attendance day by the server.
ALTER TABLE `attendances` ADD COLUMN `check_out_at` DATETIME(3) NULL;
