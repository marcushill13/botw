package com.botw.ui;

import com.botw.data.Challenge;
import com.botw.data.ChallengeType;
import com.botw.data.PrizeCandidate;
import com.botw.data.WeeklyTargets;
import com.botw.data.DropRule;
import com.botw.data.LeaderboardEntry;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntConsumer;
import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.FontManager;

/**
 * One challenge, open.
 * <p>
 * The same screen whether you made it or joined it. A creator wants to see the leaderboard as much as
 * anyone else does, and giving them a different view would mean two things to keep in step.
 */
public class ChallengeView extends JPanel
{
	private static final int MAX_DISCORD_RANKS = 25;

	/**
	 * What the creator may do to the leaderboard by hand. Null for everyone else, which is what makes
	 * the controls appear only for them.
	 * <p>
	 * This exists because some of a clan plays on mobile, where no plugin can run and no kill can ever
	 * be counted. Those players do what they have always done — send screenshots — and staff put the
	 * number in, so they end up on the same board as everyone else rather than in a spreadsheet
	 * alongside it.
	 */
	public interface LeaderboardEditor
	{
		void add(String rsn, int points);

		/**
		 * @param changes every row the creator actually altered, name to new total. Passed together
		 *                rather than one at a time so the whole edit is one trip and one redraw; a call
		 *                per row would race several reopens against each other.
		 */
		void setPoints(Map<String, Integer> changes);

		void remove(String rsn);
	}

	private final ItemManager itemManager;
	private final Runnable onBack;

	/** Held so the leaderboard alone can be redrawn when edit mode is switched on and off. */
	private final JPanel leaderboardHolder = new JPanel();
	private final JPanel prizeHolder = new JPanel();
	private String ranking = "Overall";

	/** Held for the same reason: both move when points land, and nothing else on the screen does. */
	private final JPanel yourPointsHolder = new JPanel();

	private Challenge challenge;
	private List<LeaderboardEntry> entries = new ArrayList<>();
	private String yourName;
	private LeaderboardEditor editor;
	private boolean editing;

	/** The points boxes while editing, by name, so Save can tell what actually changed. */
	private final Map<String, JTextField> pointsFields = new LinkedHashMap<>();

	public ChallengeView(
		Challenge challenge,
		List<LeaderboardEntry> leaderboard,
		String yourName,
		boolean creator,
		ItemManager itemManager,
		Runnable onBack,
		Runnable onRefresh)
	{
		this(challenge, leaderboard, yourName, creator, itemManager, onBack, onRefresh, null);
	}

	public ChallengeView(
		Challenge challenge,
		List<LeaderboardEntry> leaderboard,
		String yourName,
		boolean creator,
		ItemManager itemManager,
		Runnable onBack,
		Runnable onRefresh,
		JPanel evidence)
	{
		this(challenge, leaderboard, yourName, creator, itemManager, onBack, onRefresh, evidence,
			null, null, null, null, null, null, null, null);
	}

	/**
	 * @param onEdit   offered only to the creator, and only when this client holds the token
	 * @param onDelete same
	 * @param editor   same again — null for a participant, which is what hides the controls
	 */
	public ChallengeView(
		Challenge challenge,
		List<LeaderboardEntry> leaderboard,
		String yourName,
		boolean creator,
		ItemManager itemManager,
		Runnable onBack,
		Runnable onRefresh,
		JPanel evidence,
		Runnable onEdit,
		Runnable onDelete,
		LeaderboardEditor editor,
		Runnable onPreview,
		Runnable onEndPreview,
		Integer discordRankLimit,
		IntConsumer onDiscordConnect,
		Runnable onDiscordRemove)
	{
		this.itemManager = itemManager;
		this.onBack = onBack;
		this.challenge = challenge;
		this.entries = leaderboard;
		this.yourName = yourName;
		this.editor = editor;

		setLayout(new BorderLayout());
		setBackground(Theme.BACKGROUND);

		JPanel body = new JPanel();
		body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
		body.setBackground(Theme.BACKGROUND);
		body.setBorder(BorderFactory.createEmptyBorder(4, 0, 8, Cards.SCROLLBAR_ALLOWANCE));

		body.add(backRow(onRefresh));
		body.add(Cards.gap(6));

		body.add(Cards.title(challenge.getName()));
		body.add(Cards.gap(2));
		body.add(Cards.body(challenge.getBoss()));
		if (challenge.getEventType() != ChallengeType.BOSS)
		{
			body.add(Cards.muted(challenge.getEventType().title()));
		}
		body.add(Cards.gap(6));

		// The countdown is the thing everyone opens this for, so it goes at the top and it is loud.
		long now = System.currentTimeMillis();
		JLabel countdown = new JLabel(Countdown.describe(challenge, now));
		countdown.setFont(FontManager.getRunescapeBoldFont().deriveFont(Font.BOLD, 15f));
		// Green while it is actually running, so "live now" is readable at a glance rather than being
		// the same colour as everything else.
		countdown.setForeground(challenge.isRunning(now) ? Theme.LIVE : Theme.GOLD);
		countdown.setAlignmentX(Component.LEFT_ALIGNMENT);
		body.add(countdown);

		body.add(Cards.gap(2));
		body.add(Cards.muted(Countdown.at(challenge.getStartsAt(), challenge.getTimezone())
			+ "  to  " + Countdown.at(challenge.getEndsAt(), challenge.getTimezone())));

		body.add(Cards.gap(8));
		body.add(codeRow(challenge, creator));

		if (onEndPreview != null)
		{
			body.add(Cards.gap(6));
			body.add(previewBanner(onEndPreview));
		}

		if (onEdit != null || onDelete != null || onPreview != null)
		{
			body.add(Cards.gap(6));
			body.add(creatorControls(challenge, onEdit, onDelete, onPreview));
		}
		if (onDiscordConnect != null)
		{
			body.add(Cards.gap(6));
			JTextField rankLimit = Theme.textField(new JTextField(
				String.valueOf(discordRankLimit == null ? MAX_DISCORD_RANKS : discordRankLimit)));
			rankLimit.setFont(Theme.figure(14f));
			rankLimit.setHorizontalAlignment(JTextField.CENTER);
			Dimension fieldSize = rankLimit.getPreferredSize();
			fieldSize.width = Math.max(52, fieldSize.width);
			rankLimit.setPreferredSize(fieldSize);

			JPanel discordRow = new JPanel(new java.awt.GridLayout(1, 2, 4, 0));
			discordRow.setBackground(Theme.BACKGROUND);
			discordRow.setAlignmentX(Component.LEFT_ALIGNMENT);
			JButton connect = Cards.button(discordRankLimit == null ? "Post to Discord" : "Update Discord");
			connect.setToolTipText("Save how many ranks appear on the Discord leaderboard");
			connect.addActionListener(event -> saveDiscordRanks(rankLimit, onDiscordConnect));
			discordRow.add(connect);
			JButton remove = Cards.button("Remove Discord");
			remove.setToolTipText("Stop updates and remove the Discord message");
			remove.addActionListener(event -> onDiscordRemove.run());
			discordRow.add(remove);
			discordRow.setMaximumSize(new Dimension(Integer.MAX_VALUE, discordRow.getPreferredSize().height));
			body.add(discordRow);

			body.add(Cards.gap(4));
			JPanel rankRow = new JPanel(new BorderLayout(8, 0));
			rankRow.setBackground(Theme.BACKGROUND);
			rankRow.setAlignmentX(Component.LEFT_ALIGNMENT);
			JLabel label = Cards.body("Discord ranks (1–" + MAX_DISCORD_RANKS + ")");
			label.setForeground(Theme.TEXT_MUTED);
			label.setLabelFor(rankLimit);
			rankRow.add(label, BorderLayout.CENTER);
			rankRow.add(rankLimit, BorderLayout.LINE_END);
			rankRow.setMaximumSize(new Dimension(Integer.MAX_VALUE, rankRow.getPreferredSize().height));
			body.add(rankRow);
		}

		body.add(Cards.gap(10));
		body.add(Cards.sectionLabel("Scoring"));
		body.add(pointsList(challenge));

		body.add(Cards.gap(10));
		body.add(Cards.sectionLabel("Leaderboard · " + challenge.scoreUnit()));
		if (challenge.getEventType() == ChallengeType.SKILL || challenge.getEventType() == ChallengeType.RAID)
		{
			List<String> choices = new ArrayList<>();
			choices.add("Overall");
			if (challenge.getEventType() == ChallengeType.SKILL)
			{
				choices.add("Levels gained");
			}
			else
			{
				choices.add("Clears");
				choices.add("Purples");
				if (WeeklyTargets.modes(challenge.getBoss()).size() > 1)
				{
					for (String mode : WeeklyTargets.modes(challenge.getBoss())) choices.add(mode + " clears");
				}
			}
			JComboBox<String> order = Cards.comboBox(choices.toArray(new String[0]));
			order.addActionListener(event ->
			{
				if (editing)
				{
					order.setSelectedItem(ranking);
					return;
				}
				ranking = String.valueOf(order.getSelectedItem());
				renderLeaderboard();
			});
			body.add(order);
			body.add(Cards.gap(4));
		}

		leaderboardHolder.setLayout(new BoxLayout(leaderboardHolder, BoxLayout.Y_AXIS));
		leaderboardHolder.setBackground(Theme.BACKGROUND);
		leaderboardHolder.setAlignmentX(Component.LEFT_ALIGNMENT);
		renderLeaderboard();
		body.add(leaderboardHolder);

		prizeHolder.setLayout(new BoxLayout(prizeHolder, BoxLayout.Y_AXIS));
		prizeHolder.setBackground(Theme.BACKGROUND);
		prizeHolder.setAlignmentX(Component.LEFT_ALIGNMENT);
		renderPrizes();
		body.add(prizeHolder);

		body.add(Cards.gap(10));
		body.add(Cards.sectionLabel("Your " + challenge.scoreUnit()));

		yourPointsHolder.setLayout(new BoxLayout(yourPointsHolder, BoxLayout.Y_AXIS));
		yourPointsHolder.setBackground(Theme.BACKGROUND);
		yourPointsHolder.setAlignmentX(Component.LEFT_ALIGNMENT);
		renderYourPoints();
		body.add(yourPointsHolder);

		// Only the creator gets this, and only when there is a token to fetch it with.
		if (evidence != null)
		{
			body.add(Cards.gap(12));
			body.add(Cards.sectionLabel("Evidence"));
			body.add(Cards.gap(2));
			body.add(Cards.muted("A screenshot of every scoring drop, sent automatically."));
			body.add(Cards.gap(4));
			body.add(evidence);
		}

		add(body, BorderLayout.NORTH);
	}

	private void saveDiscordRanks(JTextField field, IntConsumer save)
	{
		int limit = 0;
		try
		{
			limit = Integer.parseInt(field.getText().trim());
		}
		catch (NumberFormatException ignored)
		{
			// The range check also handles empty and nonnumeric input.
		}
		if (limit < 1 || limit > MAX_DISCORD_RANKS)
		{
			Cards.warn(this, "Enter a whole number from 1 to " + MAX_DISCORD_RANKS + ".");
			field.requestFocusInWindow();
			field.selectAll();
			return;
		}
		save.accept(limit);
	}

	private JPanel backRow(Runnable onRefresh)
	{
		JPanel row = new JPanel();
		row.setLayout(new BoxLayout(row, BoxLayout.X_AXIS));
		row.setBackground(Theme.BACKGROUND);
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
		code.setForeground(Theme.GOLD);
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

	/**
	 * Editing and deleting, for whoever made it.
	 * <p>
	 * Deleting asks first and says what goes with it. A challenge takes the events and the screenshots
	 * down with it, and that is not something to discover afterwards.
	 */
	/**
	 * Says loudly that this is not the real thing, and gets back out.
	 * <p>
	 * Without it the preview is indistinguishable from having lost your creator rights, which is a
	 * frightening thing to see on a challenge you are running.
	 */
	private JPanel previewBanner(Runnable onEndPreview)
	{
		JPanel card = Cards.card();

		JLabel heading = new JLabel("VIEWING AS A PLAYER");
		heading.setFont(FontManager.getRunescapeBoldFont());
		heading.setForeground(Theme.GOLD);
		heading.setAlignmentX(Component.LEFT_ALIGNMENT);
		card.add(heading);

		card.add(Cards.gap(2));
		card.add(Cards.muted("This is what everyone who joined sees. Nothing here is changed for them."));
		card.add(Cards.gap(4));

		JButton back = Cards.button("Back to your dashboard");
		back.setAlignmentX(Component.LEFT_ALIGNMENT);
		back.addActionListener(event -> onEndPreview.run());
		card.add(back);

		card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
		return card;
	}

	private JPanel creatorControls(
		Challenge challenge, Runnable onEdit, Runnable onDelete, Runnable onPreview)
	{
		JPanel row = new JPanel();
		row.setLayout(new BoxLayout(row, BoxLayout.X_AXIS));
		row.setBackground(Theme.BACKGROUND);
		row.setAlignmentX(Component.LEFT_ALIGNMENT);
		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, 24));

		if (onPreview != null)
		{
			// Whoever runs a challenge holds its creator token, so they can never reach the plain
			// participant screen on their own account — they see the dashboard even after joining. This
			// shows them what the rest of the clan is looking at.
			JButton preview = Cards.button("View as player");
			preview.setToolTipText("See this challenge the way everyone who joined sees it");
			preview.addActionListener(event -> onPreview.run());
			row.add(preview);
			row.add(javax.swing.Box.createHorizontalStrut(4));
		}

		if (onEdit != null)
		{
			JButton edit = Cards.button("Edit");
			edit.addActionListener(event -> onEdit.run());
			row.add(edit);
			row.add(javax.swing.Box.createHorizontalStrut(4));
		}

		if (onDelete != null)
		{
			JButton delete = Cards.button("Delete");
			delete.setToolTipText("Removes the challenge, its scores and its screenshots for everyone");
			delete.addActionListener(event ->
			{
				int answer = javax.swing.JOptionPane.showConfirmDialog(
					this,
					"Delete \"" + challenge.getName() + "\"?" + System.lineSeparator()
						+ System.lineSeparator()
						+ "This removes it for everyone who joined, along with every score and every "
						+ "screenshot. It cannot be undone.",
					"Boss of the Week",
					javax.swing.JOptionPane.YES_NO_OPTION);

				if (answer == javax.swing.JOptionPane.YES_OPTION)
				{
					onDelete.run();
				}
			});

			row.add(delete);
		}

		return row;
	}

	private JPanel pointsList(Challenge challenge)
	{
		JPanel list = new JPanel();
		list.setLayout(new BoxLayout(list, BoxLayout.Y_AXIS));
		list.setBackground(Theme.BACKGROUND);
		list.setAlignmentX(Component.LEFT_ALIGNMENT);

		switch (challenge.getEventType())
		{
			case BOSS:
				list.add(row(null, "Every " + challenge.getKcPer() + " kills",
					challenge.getKcPoints() + " pts", Theme.TEXT));
				break;
			case RAID:
				if (challenge.isRaidByPoints())
				{
					for (String mode : WeeklyTargets.modes(challenge.getBoss()))
					{
						list.add(row(null, mode + " clear",
							challenge.getRaidPoints().getOrDefault(mode, 1) + " pts", Theme.TEXT));
					}
				}
				else list.add(Cards.muted("Most raid clears wins."));
				break;
			case SKILL:
				list.add(Cards.muted("Most XP gained wins. Level gains have their own ranking."));
				break;
			case CLUE:
				list.add(Cards.muted("Most " + challenge.getBoss().toLowerCase(java.util.Locale.ROOT)
					+ " clue caskets opened wins."));
				break;
			case MINIGAME:
				list.add(Cards.muted("Most rifts closed wins."));
				break;
		}

		for (DropRule drop : challenge.getDrops())
		{
			boolean scores = (challenge.getEventType() == ChallengeType.BOSS
				|| (challenge.getEventType() == ChallengeType.RAID && challenge.isRaidByPoints()))
				&& drop.getPoints() > 0;
			if (!scores && !drop.isFirstPrize() && !drop.isPurple()) continue;
			list.add(Cards.gap(2));
			String value = scores ? drop.getPoints() + " pts" : drop.isFirstPrize() ? "First" : "Purple";
			list.add(row(drop.getItemId(), drop.getName(), value, Theme.TEXT));
		}

		return list;
	}

	public String getChallengeCode()
	{
		return challenge.getCode();
	}

	/**
	 * Takes a fresh leaderboard without rebuilding the screen.
	 * <p>
	 * Called when this client's kills reach the service, which is a minute or so after they happen.
	 * Before this, points landed on the server and the open screen went on showing whatever it had been
	 * built with — you killed something, the evidence appeared, and your score did not move until you
	 * pressed Refresh. The numbers were never wrong, only the picture of them.
	 * <p>
	 * Only the two parts that can have changed are redrawn, rather than the whole screen, so this does
	 * not throw away where you had scrolled to or shut the evidence folder you were reading.
	 */
	public void update(List<LeaderboardEntry> fresh, Challenge latest)
	{
		// Never mid-edit. The creator has half-typed numbers in those boxes, and replacing the rows
		// under them would lose what they had entered.
		if (editing)
		{
			return;
		}

		entries = fresh;
		if (latest != null) challenge.setPrizeCandidates(latest.getPrizeCandidates());
		renderLeaderboard();
		renderYourPoints();
		renderPrizes();
	}

	/** Whether the creator is part way through changing scores, in which case leave the screen alone. */
	public boolean isEditingLeaderboard()
	{
		return editing;
	}

	private void renderYourPoints()
	{
		yourPointsHolder.removeAll();
		yourPointsHolder.add(yourPoints(entries, yourName, challenge));
		yourPointsHolder.revalidate();
		yourPointsHolder.repaint();
	}

	/** Fills {@link #leaderboardHolder}, in whichever mode it is currently in. */
	private void renderLeaderboard()
	{
		leaderboardHolder.removeAll();
		pointsFields.clear();

		if (editor != null)
		{
			leaderboardHolder.add(editorControls());
			leaderboardHolder.add(Cards.gap(4));
		}

		if (entries.isEmpty())
		{
			leaderboardHolder.add(Cards.muted("Nobody has scored yet."));
		}

		if (challenge.getEventType() != ChallengeType.BOSS && !entries.isEmpty())
		{
			long total = entries.stream().mapToLong(LeaderboardEntry::getPoints).sum();
			long scored = entries.stream().filter(entry -> entry.getPoints() > 0 || entry.getKills() > 0).count();
			leaderboardHolder.add(Cards.muted(format(total) + " " + challenge.scoreUnit()
				+ " · " + scored + " players scored"));
			leaderboardHolder.add(Cards.gap(4));
		}

		List<LeaderboardEntry> ranked = new ArrayList<>(entries);
		if (!editing && !"Overall".equals(ranking))
		{
			ranked.sort(Comparator.comparingInt(this::rankValue).reversed()
				.thenComparing(LeaderboardEntry::getRsn, String.CASE_INSENSITIVE_ORDER));
		}
		int place = 1;
		for (LeaderboardEntry entry : ranked)
		{
			leaderboardHolder.add(row(entry, place++));
			leaderboardHolder.add(Cards.gap(2));
		}

		if (editing)
		{
			leaderboardHolder.add(Cards.gap(4));
			leaderboardHolder.add(saveRow());
		}

		leaderboardHolder.revalidate();
		leaderboardHolder.repaint();
	}

	private void renderPrizes()
	{
		prizeHolder.removeAll();
		if (challenge.getDrops().stream().anyMatch(DropRule::isFirstPrize))
		{
			prizeHolder.add(Cards.gap(10));
			prizeHolder.add(Cards.sectionLabel("First prize candidates"));
			prizeHolder.add(Cards.muted("Earliest recorded drops. Confirm screenshots and claims before awarding."));
			for (DropRule rule : challenge.getDrops())
			{
				if (!rule.isFirstPrize()) continue;
				String holder = "Unclaimed";
				for (PrizeCandidate candidate : challenge.getPrizeCandidates())
				{
					if (rule.getName().equalsIgnoreCase(candidate.getItemName()))
					{
						holder = candidate.getRsn();
						break;
					}
				}
				prizeHolder.add(Cards.muted(rule.getName() + ": " + holder));
			}
		}
		prizeHolder.revalidate();
		prizeHolder.repaint();
	}

	private int rankValue(LeaderboardEntry entry)
	{
		if (editing) return entry.getPoints();
		switch (ranking)
		{
			case "Overall": return entry.getPoints();
			case "Levels gained": return entry.getLevels();
			case "Clears": return entry.getKills();
			case "Purples": return entry.getPurples();
			default: return entry.getRaidModes().getOrDefault(ranking.replace(" clears", ""), 0);
		}
	}

	private static String format(long value)
	{
		return NumberFormat.getIntegerInstance(java.util.Locale.ROOT).format(value);
	}

	private String activitySummary(LeaderboardEntry entry)
	{
		switch (challenge.getEventType())
		{
			case SKILL: return format(entry.getLevels()) + " levels gained";
			case RAID: return format(entry.getKills()) + " clears, " + format(entry.getPurples()) + " purples";
			case CLUE: return format(entry.getKills()) + " caskets opened";
			case MINIGAME: return format(entry.getKills()) + " rifts closed";
			default: return entry.getKills() + " kills, " + entry.getDrops() + " drops";
		}
	}

	private JPanel row(LeaderboardEntry entry, int place)
	{
		boolean you = entry.getRsn().equalsIgnoreCase(yourName == null ? "" : yourName);

		JPanel row = new JPanel(new BorderLayout(4, 0));
		row.setBackground(Theme.CARD);
		row.setBorder(BorderFactory.createEmptyBorder(4, 6, 4, 6));
		row.setAlignmentX(Component.LEFT_ALIGNMENT);

		JLabel position = new JLabel(place + ".");
		position.setFont(FontManager.getRunescapeSmallFont());
		position.setForeground(Theme.TEXT_MUTED);
		row.add(position, BorderLayout.WEST);

		JPanel text = new JPanel();
		text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
		text.setBackground(row.getBackground());

		JLabel name = new JLabel(entry.getRsn());
		name.setFont(FontManager.getRunescapeBoldFont());
		// Your own row is highlighted, because on a fifty-person leaderboard finding yourself is
		// the first thing anyone does.
		name.setForeground(you ? Theme.GOLD : Theme.TEXT);
		name.setAlignmentX(Component.LEFT_ALIGNMENT);
		text.add(name);

		if (entry.isManual())
		{
			// Said plainly on the row. These points were typed in by staff from a screenshot, and a
			// leaderboard that hid that would be claiming to have counted something it never saw.
			JLabel tag = new JLabel("Manual / Mobile");
			tag.setFont(FontManager.getRunescapeSmallFont().deriveFont(Font.ITALIC));
			tag.setForeground(Theme.TEXT_MUTED);
			tag.setAlignmentX(Component.LEFT_ALIGNMENT);
			text.add(tag);
		}
		else
		{
			text.add(Cards.mutedInRow(activitySummary(entry)));
		}

		row.add(text, BorderLayout.CENTER);
		row.add(editing ? pointsEditor(entry) : pointsLabel(entry), BorderLayout.EAST);

		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
		return row;
	}

	private JLabel pointsLabel(LeaderboardEntry entry)
	{
		JLabel points = new JLabel(format(rankValue(entry)));
		points.setFont(FontManager.getRunescapeBoldFont());
		points.setForeground(Theme.GOLD);
		return points;
	}

	/** The points box, and an X for anyone who was added by hand. */
	private JPanel pointsEditor(LeaderboardEntry entry)
	{
		JPanel side = new JPanel(new BorderLayout(2, 0));
		side.setBackground(Theme.CARD);

		JTextField field = Theme.textField(new JTextField(String.valueOf(entry.getPoints())));
		field.setPreferredSize(new Dimension(46, 20));
		field.setHorizontalAlignment(JTextField.RIGHT);
		pointsFields.put(entry.getRsn(), field);
		side.add(field, BorderLayout.CENTER);

		// Only for hand-added rows. Removing someone who is playing would throw away kills their own
		// client reported, and the way off the board for them is to leave the challenge.
		if (entry.isManual())
		{
			JButton remove = Cards.button("✕");
			remove.setPreferredSize(new Dimension(22, 20));
			remove.setToolTipText("Remove " + entry.getRsn());
			remove.addActionListener(event ->
			{
				if (confirmed("Remove " + entry.getRsn() + " from the leaderboard?"))
				{
					editor.remove(entry.getRsn());
				}
			});
			side.add(remove, BorderLayout.EAST);
		}

		return side;
	}

	/** Add and Edit, above the board, for the creator only. */
	private JPanel editorControls()
	{
		JPanel row = new JPanel(new BorderLayout(4, 0));
		row.setBackground(Theme.BACKGROUND);
		row.setAlignmentX(Component.LEFT_ALIGNMENT);

		JButton add = Cards.button("+ Add player");
		add.setToolTipText("Add someone who cannot run the plugin, such as a mobile player");
		add.addActionListener(event -> promptForPlayer());
		row.add(add, BorderLayout.CENTER);

		JButton edit = Cards.button(editing ? "Cancel" : "Edit scores");
		edit.addActionListener(event ->
		{
			editing = !editing;
			renderLeaderboard();
		});
		row.add(edit, BorderLayout.EAST);

		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
		return row;
	}

	private JPanel saveRow()
	{
		JPanel row = new JPanel(new BorderLayout());
		row.setBackground(Theme.BACKGROUND);
		row.setAlignmentX(Component.LEFT_ALIGNMENT);

		JButton save = Cards.button("Save changes");
		save.addActionListener(event -> saveEdits());
		row.add(save, BorderLayout.CENTER);

		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
		return row;
	}

	/**
	 * Sends only the rows whose number actually changed.
	 * <p>
	 * Saving all of them would be a request per player and would write an adjustment onto people the
	 * creator never touched, which is exactly the kind of thing that turns up a fortnight later as
	 * "why is everyone's score frozen".
	 */
	private void saveEdits()
	{
		Map<String, Integer> changes = new LinkedHashMap<>();

		for (LeaderboardEntry entry : entries)
		{
			JTextField field = pointsFields.get(entry.getRsn());
			if (field == null)
			{
				continue;
			}

			Integer wanted = parsePoints(field.getText());
			if (wanted == null)
			{
				// Nothing is sent when one box is wrong. Saving the good rows and stopping at the bad
				// one would leave the creator guessing which half went through.
				Cards.warn(this, "\"" + field.getText().trim() + "\" is not a number of points.");
				return;
			}

			if (wanted != entry.getPoints())
			{
				changes.put(entry.getRsn(), wanted);
			}
		}

		editing = false;

		if (changes.isEmpty())
		{
			// Nobody was changed, so nothing is sent — but the board still has to come out of edit mode,
			// which the reopen would otherwise have done.
			renderLeaderboard();
			return;
		}

		editor.setPoints(changes);
	}

	/** Null when it is not a whole number. Negatives are allowed: docking points is a real thing. */
	static Integer parsePoints(String text)
	{
		try
		{
			return Integer.valueOf(text.trim());
		}
		catch (NumberFormatException e)
		{
			return null;
		}
	}

	/**
	 * The name box for adding someone by hand, with their points alongside it — staff are entering
	 * both off the same screenshot, and asking for the name first and the score afterwards would be
	 * two dialogs for one thought.
	 */
	private void promptForPlayer()
	{
		JPanel form = new JPanel();
		form.setLayout(new BoxLayout(form, BoxLayout.Y_AXIS));

		JTextField name = new JTextField(14);
		JTextField points = new JTextField("0", 14);

		form.add(new JLabel("RuneScape name"));
		form.add(name);
		form.add(new JLabel(" "));
		form.add(new JLabel("Points"));
		form.add(points);

		SwingUtilities.invokeLater(name::requestFocusInWindow);

		int choice = JOptionPane.showConfirmDialog(
			this, form, "Add a player", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);

		if (choice != JOptionPane.OK_OPTION)
		{
			return;
		}

		String rsn = name.getText().trim();
		if (rsn.isEmpty())
		{
			Cards.warn(this, "A name is needed.");
			return;
		}

		Integer starting = parsePoints(points.getText());
		if (starting == null)
		{
			Cards.warn(this, "\"" + points.getText().trim() + "\" is not a number of points.");
			return;
		}

		editor.add(rsn, starting);
	}

	private boolean confirmed(String question)
	{
		return JOptionPane.showConfirmDialog(
			this, question, "Boss of the Week", JOptionPane.YES_NO_OPTION) == JOptionPane.YES_OPTION;
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
		JLabel total = new JLabel(format(points) + " " + challenge.scoreUnit());
		total.setFont(FontManager.getRunescapeBoldFont().deriveFont(Font.BOLD, 16f));
		total.setForeground(Theme.GOLD);
		total.setAlignmentX(Component.LEFT_ALIGNMENT);
		card.add(total);

		if (challenge.getEventType() != ChallengeType.BOSS)
		{
			card.add(Cards.gap(2));
			card.add(Cards.muted(you == null ? "Nothing counted yet." : activitySummary(you)));
			if (you != null && you.getAdjustment() != 0)
			{
				card.add(Cards.muted("Creator adjustment: " + format(you.getAdjustment())));
			}
			card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
			return card;
		}

		// Somebody the creator entered by hand has no kills and no drops but does have points, and
		// telling them to go and kill something under a score of ten would read as a broken screen.
		boolean nothingYet = you == null
			|| (you.getKills() == 0 && you.getDrops() == 0 && you.getAdjustment() == 0);

		if (nothingYet)
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

			// Taken off before the drops are worked out. This line used to be the whole remainder, so
			// anything the creator had added showed up as though a drop had been worth it — a 30 point
			// drop reading as 50 because twenty had been granted by hand.
			int adjustment = you.getAdjustment();

			card.add(Cards.muted(you.getKills() + " kills — " + killPoints + " pts"));
			card.add(Cards.muted(you.getDrops() + " counted drops — "
				+ (points - killPoints - adjustment) + " pts"));

			if (adjustment != 0)
			{
				card.add(Cards.muted("Set by the creator — "
					+ (adjustment > 0 ? "+" : "") + adjustment + " pts"));
			}
		}

		card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
		return card;
	}

	/** An optional icon, a label, and a value on the right. */
	private JPanel row(Integer itemId, String label, String value, Color colour)
	{
		JPanel row = new JPanel(new BorderLayout(4, 0));
		row.setBackground(Theme.CARD);
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
		points.setForeground(Theme.GOLD);
		row.add(points, BorderLayout.EAST);

		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
		return row;
	}
}
