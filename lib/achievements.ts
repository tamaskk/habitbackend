// Achievement definitions and checking logic

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji or icon identifier
  category: 'streak' | 'completion' | 'habit' | 'milestone' | 'special';
  requirement: number; // Target value (e.g., 7 for 7-day streak)
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Streak Achievements
  {
    id: 'first_completion',
    name: 'Getting Started',
    description: 'Complete your first habit',
    icon: '🎯',
    category: 'milestone',
    requirement: 1,
    rarity: 'common',
  },
  {
    id: 'streak_3',
    name: 'On a Roll',
    description: 'Maintain a 3-day streak',
    icon: '🔥',
    category: 'streak',
    requirement: 3,
    rarity: 'common',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: '⭐',
    category: 'streak',
    requirement: 7,
    rarity: 'common',
  },
  {
    id: 'streak_14',
    name: 'Fortnight Fighter',
    description: 'Maintain a 14-day streak',
    icon: '💪',
    category: 'streak',
    requirement: 14,
    rarity: 'rare',
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    icon: '👑',
    category: 'streak',
    requirement: 30,
    rarity: 'rare',
  },
  {
    id: 'streak_60',
    name: 'Two Month Titan',
    description: 'Maintain a 60-day streak',
    icon: '🏆',
    category: 'streak',
    requirement: 60,
    rarity: 'epic',
  },
  {
    id: 'streak_100',
    name: 'Century Champion',
    description: 'Maintain a 100-day streak',
    icon: '💯',
    category: 'streak',
    requirement: 100,
    rarity: 'legendary',
  },
  
  // Completion Achievements
  {
    id: 'completions_10',
    name: 'Decade of Dedication',
    description: 'Complete 10 habits',
    icon: '🔟',
    category: 'completion',
    requirement: 10,
    rarity: 'common',
  },
  {
    id: 'completions_50',
    name: 'Half Century',
    description: 'Complete 50 habits',
    icon: '🎖️',
    category: 'completion',
    requirement: 50,
    rarity: 'rare',
  },
  {
    id: 'completions_100',
    name: 'Centurion',
    description: 'Complete 100 habits',
    icon: '💯',
    category: 'completion',
    requirement: 100,
    rarity: 'epic',
  },
  {
    id: 'completions_500',
    name: 'Five Hundred Hero',
    description: 'Complete 500 habits',
    icon: '🌟',
    category: 'completion',
    requirement: 500,
    rarity: 'legendary',
  },
  {
    id: 'completions_1000',
    name: 'Millennium Master',
    description: 'Complete 1000 habits',
    icon: '✨',
    category: 'completion',
    requirement: 1000,
    rarity: 'legendary',
  },
  
  // Habit Creation Achievements
  {
    id: 'habits_created_5',
    name: 'Habit Builder',
    description: 'Create 5 habits',
    icon: '📝',
    category: 'habit',
    requirement: 5,
    rarity: 'common',
  },
  {
    id: 'habits_created_10',
    name: 'Habit Collector',
    description: 'Create 10 habits',
    icon: '📚',
    category: 'habit',
    requirement: 10,
    rarity: 'rare',
  },
  {
    id: 'habits_created_20',
    name: 'Habit Master',
    description: 'Create 20 habits',
    icon: '🎓',
    category: 'habit',
    requirement: 20,
    rarity: 'epic',
  },
  
  // Special Achievements
  {
    id: 'perfect_week',
    name: 'Perfect Week',
    description: 'Complete all habits for 7 consecutive days',
    icon: '🌙',
    category: 'special',
    requirement: 7,
    rarity: 'rare',
  },
  {
    id: 'perfect_month',
    name: 'Perfect Month',
    description: 'Complete all habits for 30 consecutive days',
    icon: '🌕',
    category: 'special',
    requirement: 30,
    rarity: 'epic',
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Complete a habit before 6 AM',
    icon: '🌅',
    category: 'special',
    requirement: 1,
    rarity: 'rare',
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Complete a habit after 11 PM',
    icon: '🦉',
    category: 'special',
    requirement: 1,
    rarity: 'rare',
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Complete habits on both Saturday and Sunday',
    icon: '🏖️',
    category: 'special',
    requirement: 1,
    rarity: 'common',
  },
  {
    id: 'variety_pack',
    name: 'Variety Pack',
    description: 'Have at least one habit of each type (Good, Bad, To-Do)',
    icon: '🎨',
    category: 'special',
    requirement: 3,
    rarity: 'common',
  },
];

export function getAchievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

export function getAllAchievements(): AchievementDefinition[] {
  return ACHIEVEMENTS;
}

export function getAchievementsByCategory(category: string): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(a => a.category === category);
}
