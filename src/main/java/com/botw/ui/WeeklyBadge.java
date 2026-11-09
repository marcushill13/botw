package com.botw.ui;

import com.botw.data.ChallengeType;
import com.botw.data.MinigameTarget;
import com.botw.data.WeeklyRewards;
import com.botw.data.WeeklyTargets;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.SwingConstants;
import net.runelite.api.Skill;
import net.runelite.client.game.ItemManager;
import net.runelite.client.game.SkillIconManager;

final class WeeklyBadge
{
	private static final SkillIconManager SKILLS = new SkillIconManager();

	private WeeklyBadge()
	{
	}

	static JPanel create(ItemManager items, ChallengeType type, String target, String title, String detail)
	{
		JPanel card = Cards.accentCard(accent(type));
		JPanel content = new JPanel(new BorderLayout(6, 0));
		content.setOpaque(false);
		content.setBorder(BorderFactory.createEmptyBorder(6, 5, 6, 5));
		JLabel icon = new JLabel("", SwingConstants.CENTER);
		icon.setPreferredSize(new Dimension(36, 34));
		Skill skill = type == ChallengeType.SKILL ? WeeklyTargets.skill(target) : null;
		if (skill != null)
		{
			icon.setIcon(new ImageIcon(SKILLS.getSkillImage(skill)));
		}
		else
		{
			items.getImage(itemIcon(type, target)).addTo(icon);
		}
		content.add(icon, BorderLayout.WEST);

		JPanel caption = new JPanel();
		caption.setOpaque(false);
		caption.setLayout(new BoxLayout(caption, BoxLayout.Y_AXIS));
		JLabel heading = Cards.body("<html><body style='width:110px'>" + Cards.escape(title) + "</body></html>");
		heading.setFont(Theme.body());
		heading.setForeground(Theme.GOLD);
		caption.add(heading);
		caption.add(Cards.mutedInRow(detail));
		content.add(caption, BorderLayout.CENTER);
		card.add(content, BorderLayout.CENTER);
		card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
		return card;
	}

	static String scoring(ChallengeType type, String target)
	{
		switch (type)
		{
			case RAID: return "Rank by clears or choose custom points.";
			case SKILL: return "Rank by XP gained. Levels have a separate ranking.";
			case CLUE: return "One count per casket opened during the event.";
			case MINIGAME:
				MinigameTarget activity = MinigameTarget.forName(target);
				return activity == null ? "Rank by completions." : activity.description;
			default: return "";
		}
	}

	private static int itemIcon(ChallengeType type, String target)
	{
		switch (type)
		{
			case RAID:
				switch (target)
				{
					case WeeklyTargets.COX: return WeeklyRewards.itemId("Olmlet");
					case WeeklyTargets.TOB: return WeeklyRewards.itemId("Lil' zik");
					case WeeklyTargets.TOA: return WeeklyRewards.itemId("Tumeken's guardian");
					default: return WeeklyRewards.itemId("Orion");
				}
			case MINIGAME:
				MinigameTarget activity = MinigameTarget.forName(target);
				return activity == null ? WeeklyRewards.clueIcon("Medium") : activity.icon;
			default: return WeeklyRewards.clueIcon(target);
		}
	}

	private static Color accent(ChallengeType type)
	{
		switch (type)
		{
			case RAID: return new Color(175, 118, 218);
			case SKILL: return new Color(103, 181, 113);
			case MINIGAME: return new Color(100, 172, 200);
			default: return Theme.GOLD;
		}
	}
}
