import Achievement from '../models/Achievement';
import Habit from '../models/Habit';
import { ACHIEVEMENTS, AchievementDefinition } from './achievements';

export interface AchievementCheckResult {
  unlocked: string[]; // Array of achievement IDs that were just unlocked
}

/**
 * Check and unlock achievements based on user's habit data
 */
export async function checkAchievements(userId: string): Promise<AchievementCheckResult> {
  const unlocked: string[] = [];

  // Get all habits for user
  const habits = await Habit.find({ userId }).lean();
  
  // Get already unlocked achievements
  const unlockedAchievements = await Achievement.find({ userId }).lean();
  const unlockedIds = new Set(unlockedAchievements.map(a => a.achievementId));

  // Calculate statistics
  const stats = calculateStats(habits);
  
  console.log('=== ACHIEVEMENT CHECK ===');
  console.log(`User: ${userId}`);
  console.log(`Total habits: ${habits.length}`);
  console.log(`Total completions: ${stats.totalCompletions}`);
  console.log(`Best streak: ${stats.bestStreak}`);
  console.log(`Perfect days: ${stats.perfectDays}`);
  console.log(`Has weekend completion: ${stats.hasWeekendCompletion}`);

  // Check each achievement
  for (const achievement of ACHIEVEMENTS) {
    // Skip if already unlocked
    if (unlockedIds.has(achievement.id)) {
      continue;
    }

    let shouldUnlock = false;

    switch (achievement.id) {
      // Streak achievements
      case 'streak_3':
      case 'streak_7':
      case 'streak_14':
      case 'streak_30':
      case 'streak_60':
      case 'streak_100':
        shouldUnlock = stats.bestStreak >= achievement.requirement;
        break;

      // Completion achievements
      case 'completions_10':
      case 'completions_50':
      case 'completions_100':
      case 'completions_500':
      case 'completions_1000':
        shouldUnlock = stats.totalCompletions >= achievement.requirement;
        break;

      // Habit creation achievements
      case 'habits_created_5':
      case 'habits_created_10':
      case 'habits_created_20':
        shouldUnlock = habits.length >= achievement.requirement;
        break;

      // First completion
      case 'first_completion':
        shouldUnlock = stats.totalCompletions >= 1;
        break;

      // Perfect week/month
      case 'perfect_week':
        shouldUnlock = stats.perfectDays >= 7;
        break;
      case 'perfect_month':
        shouldUnlock = stats.perfectDays >= 30;
        break;

      // Variety pack
      case 'variety_pack':
        const hasGood = habits.some(h => h.type === 'Good');
        const hasBad = habits.some(h => h.type === 'Bad');
        const hasTodo = habits.some(h => h.type === 'To-Do');
        shouldUnlock = hasGood && hasBad && hasTodo;
        break;

      // Weekend warrior
      case 'weekend_warrior':
        shouldUnlock = stats.hasWeekendCompletion;
        break;

      // Early bird and night owl are checked separately (need time info)
      // These would need to be checked when completing habits with time info
      case 'early_bird':
      case 'night_owl':
        // These require time information which we don't currently track
        // Skip for now - can be implemented later with completion timestamps
        shouldUnlock = false;
        break;
        
      default:
        // Unknown achievement type - log for debugging
        console.warn(`Unknown achievement ID: ${achievement.id}`);
        shouldUnlock = false;
        break;
    }

    if (shouldUnlock) {
      console.log(`Unlocking achievement: ${achievement.id} (${achievement.name})`);
      await Achievement.create({
        userId,
        achievementId: achievement.id,
        unlockedAt: new Date(),
      });
      unlocked.push(achievement.id);
    } else {
      // Log why achievement wasn't unlocked for debugging
      if (achievement.category === 'completion') {
        console.log(`Achievement ${achievement.id} not unlocked: ${stats.totalCompletions} < ${achievement.requirement}`);
      } else if (achievement.category === 'streak') {
        console.log(`Achievement ${achievement.id} not unlocked: ${stats.bestStreak} < ${achievement.requirement}`);
      } else if (achievement.category === 'habit') {
        console.log(`Achievement ${achievement.id} not unlocked: ${habits.length} < ${achievement.requirement}`);
      }
    }
  }
  
  console.log(`Unlocked ${unlocked.length} new achievement(s): ${unlocked.join(', ')}`);
  console.log('=== ACHIEVEMENT CHECK END ===');

  return { unlocked };
}

interface UserStats {
  totalCompletions: number;
  bestStreak: number;
  currentStreak: number;
  perfectDays: number;
  hasWeekendCompletion: boolean;
}

function calculateStats(habits: any[]): UserStats {
  let totalCompletions = 0;
  const completionDates = new Set<string>();
  let hasWeekendCompletion = false;

  // Collect all completion dates
  for (const habit of habits) {
    const goal = habit.goal || 1;
    
    for (const completion of habit.completions || []) {
      // For quantifiable habits (goal > 1), check if progress >= goal
      // For boolean habits (goal === 1), check completed flag
      const isCompleted = goal > 1 
        ? ((completion.progress || 0) >= goal)
        : (completion.completed === true);
      
      if (isCompleted) {
        const date = new Date(completion.date);
        const dateStr = date.toISOString().split('T')[0];
        completionDates.add(dateStr);
        totalCompletions++;

        // Check for weekend completion
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          hasWeekendCompletion = true;
        }
      }
    }
  }

  // Calculate streaks
  const sortedDates = Array.from(completionDates).sort();
  let bestStreak = 0;
  let currentStreak = 0;
  let tempStreak = 0;
  let perfectDays = 0;

  if (sortedDates.length > 0) {
    let prevDate: Date | null = null;
    for (const dateStr of sortedDates) {
      const currentDate = new Date(dateStr + 'T00:00:00Z');
      
      if (prevDate) {
        const daysDiff = Math.floor(
          (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysDiff === 1) {
          tempStreak++;
        } else {
          bestStreak = Math.max(bestStreak, tempStreak);
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      
      prevDate = currentDate;
    }
    bestStreak = Math.max(bestStreak, tempStreak);
    currentStreak = tempStreak; // Current streak is the last one
  }

  // Calculate perfect days (days where all active habits were completed)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(today);
    checkDate.setUTCDate(today.getUTCDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    if (completionDates.has(dateStr)) {
      // Check if all active habits for that day were completed
      let allCompleted = true;
      for (const habit of habits) {
        const dayOfWeek = checkDate.getDay() === 0 ? 7 : checkDate.getDay();
        const activeDays = habit.activeDays || [];
        
        if (activeDays.includes(dayOfWeek)) {
          const habitStartDate = new Date(habit.startDate);
          habitStartDate.setUTCHours(0, 0, 0, 0);
          
          if (checkDate >= habitStartDate) {
            // Check if this habit was completed on this date
            const habitGoal = habit.goal || 1;
            const wasCompleted = habit.completions?.some((c: any) => {
              const compDate = new Date(c.date);
              compDate.setUTCHours(0, 0, 0, 0);
              if (compDate.getTime() === checkDate.getTime()) {
                // For quantifiable habits, check progress >= goal
                // For boolean habits, check completed flag
                return habitGoal > 1
                  ? ((c.progress || 0) >= habitGoal)
                  : (c.completed === true);
              }
              return false;
            });
            
            if (!wasCompleted) {
              allCompleted = false;
              break;
            }
          }
        }
      }
      
      if (allCompleted) {
        perfectDays++;
      }
    }
  }

  return {
    totalCompletions,
    bestStreak,
    currentStreak,
    perfectDays,
    hasWeekendCompletion,
  };
}
