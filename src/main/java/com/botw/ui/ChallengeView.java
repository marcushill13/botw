package com.botw.ui;

import com.botw.data.Challenge;
import com.botw.data.DropRule;
import com.botw.data.LeaderboardEntry;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.util.List;
import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JPanel;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.FontManager;

/**
 * One challenge, open.
 * <p>
 * The same screen whether you made it or joined it. A creator wants to see the leaderboard as much as
 * anyone else does, and giving them a different view would mean two things to keep in step.
 */
public class ChallengeView extends JPanel
{
	private final ItemManager itemManager;
	private final Runnable onBack;

	public ChallengeView(
		Challenge challenge,
		List<LeaderboardEntry> leaderboard,
		String yourName,
		boolean creator,
		ItemManager itemManager,
		Runnable onBack,
		Runnable onRefresh)
	{
		this.itemManager = itemManager;
		this.onBack = onBack;

		setLayout(new BorderLayout());
		setBackground(ColorScheme.DARK_GRAY_COLOR);

		JPanel body = new JPanel();
		body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
		body.setBackground(ColorScheme.DARK_GRAY_COLOR);
		body.setBorder(BorderFactory.createEmptyBorder(4, 0, 8, Cards.SCROLLBAR_ALLOWANCE));

		body.add(backRow(onRefresh));
		body.add(Cards.gap(6));

		body.add(Cards.title(challenge.getName()));
		body.add(Cards.gap(2));
		body.add(Cards.body(challenge.getBoss()));
		body.add(Cards.gap(6));

		// The countdown is the thing everyone opens this for, so it goes at the top and it is loud.
		long now = System.currentTimeMillis();
		JLabel countdown = new JLabel(Countdown.describe(challenge, now));
		countdown.setFont(FontManager.getRunescapeBoldFont().deriveFont(Font.BOLD, 15f));
		countdown.setForeground(challenge.isRunning(now) ? ColorScheme.BRAND_ORANGE : Cards.mutedColor());
		countdown.setAlignmentX(Component.LEFT_ALIGNMENT);
		body.add(countdown);

		body.add(Cards.gap(2));
		body.add(Cards.muted(Countdown.at(challenge.getStartsAt(), challenge.getTimezone())
			+ "  to  " + Countdown.at(challenge.getEndsAt(), challenge.getTimezone())));

		body.add(Cards.gap(8));
		body.add(codeRow(challenge, creator));

		body.add(Cards.gap(10));
		body.add(Cards.sectionLabel("Points"));
		body.add(pointsList(challenge));

		body.add(Cards.gap(10));
		body.add(Cards.sectionLabel("Leaderboard"));
		body.add(leaderboardList(leaderboard, yourName));

		body.add(Cards.gap(10));
		body.add(Cards.sectionLabel("Your points"));
		body.add(yourPoints(leaderboard, yourName, challenge));

		add(body, BorderLayout.NORTH);
	}

	private JPanel backRow(Runnable onRefresh)
	{
		JPanel row = new JPanel();
		row.setLayout(new BoxLayout(row, BoxLayout.X_AXIS));
		row.setBackground(ColorScheme.DARK_GRAY_COLOR);
		row.setAlignmentX(Component.LEFT_ALIGNMENT);
		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, 24));

		JButton back = Cards.button("← All challenges");
		back.addActionListener(event -> onBack.run());
		row.add(back);

		row.add(javax.swing.Box.createHorizontalStrut(4));

		JButton refresh = Cards.button("Refresh");
		refresh.addActionListener(event -> onRefresh.run());
		row.add(refresh);

		return row;
	}

	/**
	 * The code, shown large. It is what the creator has to paste into Discord, and what everyone else
	 * has to read back, so it is the one thing on here worth making easy to copy by eye.
	 */
	private JPanel codeRow(Challenge challenge, boolean creator)
	{
		JPanel card = Cards.card();

		card.add(Cards.sectionLabel(creator ? "Your challenge code" : "Challenge code"));

		JLabel code = new JLabel(challenge.getCode());
		code.setFont(FontManager.getRunescapeBoldFont().deriveFont(Font.BOLD, 18f));
		code.setForeground(ColorScheme.BRAND_ORANGE);
		code.setAlignmentX(Component.LEFT_ALIGNMENT);
		card.add(code);

		if (creator)
		{
			card.add(Cards.gap(2));
			card.add(Cards.muted("Share this so people can join."));
		}

		card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
		return card;
	}

	private JPanel pointsList(Challenge challenge)
	{
		JPanel list = new JPanel();
		list.setLayout(new BoxLayout(list, BoxLayout.Y_AXIS));
		list.setBackground(ColorScheme.DARK_GRAY_COLOR);
		list.setAlignmentX(Component.LEFT_ALIGNMENT);

		list.add(row(null, "Every " + challenge.getKcPer() + " kills",
			challenge.getKcPoints() + " pts", ColorScheme.LIGHT_GRAY_COLOR));

		for (DropRule drop : challenge.getDrops())
		{
			list.add(Cards.gap(2));
			list.add(row(drop.getItemId(), drop.getName(),
				drop.getPoints() + " pts", ColorScheme.LIGHT_GRAY_COLOR));
		}

		if (challenge.getDrops().isEmpty())
		{
			list.add(Cards.gap(2));
			list.add(Cards.muted("No drops on this one — kill count only."));
		}

		return list;
	}

	private JPanel leaderboardList(List<LeaderboardEntry> leaderboard, String yourName)
	{
		JPanel list = new JPanel();
		list.setLayout(new BoxLayout(list, BoxLayout.Y_AXIS));
		list.setBackground(ColorScheme.DARK_GRAY_COLOR);
		list.setAlignmentX(Component.LEFT_ALIGNMENT);

		if (leaderboard.isEmpty())
		{
			list.add(Cards.muted("Nobody has scored yet."));
			return list;
		}

		int place = 1;
		for (LeaderboardEntry entry : leaderboard)
		{
			boolean you = entry.getRsn().equalsIgnoreCase(yourName == null ? "" : yourName);

			JPanel row = new JPanel(new BorderLayout(4, 0));
			row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
			row.setBorder(BorderFactory.createEmptyBorder(4, 6, 4, 6));
			row.setAlignmentX(Component.LEFT_ALIGNMENT);

			JLabel position = new JLabel(place++ + ".");
			position.setFont(FontManager.getRunescapeSmallFont());
			position.setForeground(Cards.mutedColor());
			row.add(position, BorderLayout.WEST);

			JPanel text = new JPanel();
			text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
			text.setBackground(row.getBackground());

			JLabel name = new JLabel(entry.getRsn());
			name.setFont(FontManager.getRunescapeBoldFont());
			// Your own row is highlighted, because on a fifty-person leaderboard finding yourself is
			// the first thing anyone does.
			name.setForeground(you ? ColorScheme.BRAND_ORANGE : ColorScheme.LIGHT_GRAY_COLOR);
			name.setAlignmentX(Component.LEFT_ALIGNMENT);
			text.add(name);

			text.add(Cards.mutedInRow(entry.getKills() + " kills, " + entry.getDrops() + " drops"));
			row.add(text, BorderLayout.CENTER);

			JLabel points = new JLabel(String.valueOf(entry.getPoints()));
			points.setFont(FontManager.getRunescapeBoldFont());
			points.setForeground(ColorScheme.BRAND_ORANGE);
			row.add(points, BorderLayout.EAST);

			row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
			list.add(row);
			list.add(Cards.gap(2));
		}

		return list;
	}

	/**
	 * Your own total, and what it is made of. Shown even at zero, because "0 points" is an answer and a
	 * blank space is not.
	 */
	private JPanel yourPoints(List<LeaderboardEntry> leaderboard, String yourName, Challenge challenge)
	{
		JPanel card = Cards.card();

		LeaderboardEntry you = null;
		for (LeaderboardEntry entry : leaderboard)
		{
			if (entry.getRsn().equalsIgnoreCase(yourName == null ? "" : yourName))
			{
				you = entry;
				break;
			}
		}

		int points = you == null ? 0 : you.getPoints();
		JLabel total = new JLabel(points + (points == 1 ? " point" : " points"));
		total.setFont(FontManager.getRunescapeBoldFont().deriveFont(Font.BOLD, 16f));
		total.setForeground(ColorScheme.BRAND_ORANGE);
		total.setAlignmentX(Component.LEFT_ALIGNMENT);
		card.add(total);

		if (you == null || (you.getKills() == 0 && you.getDrops() == 0))
		{
			card.add(Cards.gap(2));
			card.add(Cards.muted(challenge.isRunning(System.currentTimeMillis())
				? "Go and kill something."
				: "Nothing counted yet."));
		}
		else
		{
			card.add(Cards.gap(2));
			int killPoints = challenge.getKcPer() > 0
				? you.getKills() / challenge.getKcPer() * challenge.getKcPoints()
				: 0;

			card.add(Cards.muted(you.getKills() + " kills — " + killPoints + " pts"));
			card.add(Cards.muted(you.getDrops() + " counted drops — "
				+ (points - killPoints) + " pts"));
		}

		card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
		return card;
	}

	/** An optional icon, a label, and a value on the right. */
	private JPanel row(Integer itemId, String label, String value, Color colour)
	{
		JPanel row = new JPanel(new BorderLayout(4, 0));
		row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
		row.setBorder(BorderFactory.createEmptyBorder(3, 6, 3, 6));
		row.setAlignmentX(Component.LEFT_ALIGNMENT);

		if (itemId != null && itemId > 0)
		{
			JLabel icon = new JLabel();
			itemManager.getImage(itemId).addTo(icon);
			row.add(icon, BorderLayout.WEST);
		}

		JLabel name = new JLabel("<html><body style='width:105px'>" + label + "</body></html>");
		name.setFont(FontManager.getRunescapeSmallFont());
		name.setForeground(colour);
		row.add(name, BorderLayout.CENTER);

		JLabel points = new JLabel(value);
		points.setFont(FontManager.getRunescapeSmallFont());
		points.setForeground(ColorScheme.BRAND_ORANGE);
		row.add(points, BorderLayout.EAST);

		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
		return row;
	}
}
