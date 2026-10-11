/* =========================================================
   🆕 EARLY ABSENT MARK — runs daily at 1:00 PM
   
   Jo log 1 PM tak check-in nahi kiya → Absent mark karo
========================================================= */
import cron from 'node-cron';
export const markEarlyAbsent = async () => {
  const today = startOfDay();
  const settings = await AttendanceSettings.getSettings();

  if (!settings.autoAbsentEnabled) {
    return { skipped: true, reason: 'Auto-absent disabled' };
  }

  /* Skip if weekend */
  const isWknd = isWeekend(today, settings.weekendDays);
  if (isWknd) {
    return { skipped: true, reason: 'Weekend' };
  }

  /* Get all active employees */
  const employees = await User.find({
    isActive: true,
    role: { $in: ['manager', 'sales', 'developer'] },
  }).select('_id name role joiningDate');

  let markedCount = 0;

  for (const emp of employees) {
    /* Skip if joining after today */
    if (emp.joiningDate && new Date(emp.joiningDate) > today) {
      continue;
    }

    /* Check existing attendance */
    const existing = await Attendance.findOne({
      employee: emp._id,
      date: today,
    });

    /* Agar record nahi hai aur loginTime bhi nahi hai → Absent */
    if (!existing || !existing.loginTime) {
      /* Check holiday */
      const holiday = await Holiday.findOne({
        isActive: true,
        $or: [
          { applicableTo: 'All' },
          { applicableTo: emp.role },
          {
            applicableTo: 'Specific',
            specificEmployees: emp._id,
          },
        ],
        $and: [
          { date: { $lte: today } },
          {
            $or: [
              { endDate: null, date: { $gte: today } },
              { endDate: { $gte: today } },
            ],
          },
        ],
      });

      if (holiday) {
        /* Holiday mark karo */
        if (existing) {
          existing.status = 'Holiday';
          existing.isHoliday = true;
          existing.holidayId = holiday._id;
          await existing.save();
        } else {
          await Attendance.create({
            employee: emp._id,
            date: today,
            status: 'Holiday',
            isHoliday: true,
            holidayId: holiday._id,
            captureMethod: 'system',
            workingMinutes: 0,
          });
        }
        continue;
      }

      /* Absent mark */
      if (existing) {
        existing.status = 'Absent';
        existing.notes = 'Auto-marked as absent (no check-in by 1 PM)';
        await existing.save();
      } else {
        await Attendance.create({
          employee: emp._id,
          date: today,
          status: 'Absent',
          workingMinutes: 0,
          captureMethod: 'system',
          notes: 'Auto-marked as absent (no check-in by 1 PM)',
        });
      }

      markedCount++;
    }
  }

  return {
    skipped: false,
    date: today,
    markedCount,
  };
};

/* =========================================================
   END OF DAY ABSENT MARK — runs at 11:59 PM
   
   Jo abhi bhi check-in nahi kiya → Absent
   (Backup — agar 1 PM cron miss ho gaya)
========================================================= */

export const startAbsentMarkJob = () => {
  /* 🆕 1:00 PM — Early absent mark */
  cron.schedule('0 13 * * *', async () => {
    try {
      console.log('🔍 Running 1 PM absent-mark job...');

      const result = await markEarlyAbsent();

      if (result.skipped) {
        console.log(`⏭️  Skipped: ${result.reason}`);
      } else {
        console.log(
          `✅ Marked ${result.markedCount} as Absent (1 PM cutoff)`
        );
      }
    } catch (err) {
      console.error('❌ 1 PM absent-mark error:', err);
    }
  });

  /* 11:59 PM — End of day backup */
  cron.schedule('59 23 * * *', async () => {
    try {
      console.log('🔍 Running 11:59 PM absent-mark backup...');

      const yesterday = new Date();

      const result = await markAbsentForDate(yesterday);

      if (result.skipped) {
        console.log(`⏭️  Skipped: ${result.reason}`);
      } else {
        console.log(
          `✅ Marked ${result.markedCount} as Absent (EOD)`
        );
      }
    } catch (err) {
      console.error('❌ EOD absent-mark error:', err);
    }
  });

  console.log('✅ Absent-mark crons started:');
  console.log('   • 1:00 PM (early absent)');
  console.log('   ✅ 11:59 PM (EOD backup)');
};