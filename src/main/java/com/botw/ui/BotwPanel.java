package com.botw.ui;

import com.botw.BotwConfig;
import com.botw.data.BossDrops;
import com.botw.data.Challenge;
import com.botw.data.LeaderboardEntry;
import com.botw.net.BotwApi;
import com.botw.track.ChallengeStore;
import com.botw.track.EventSender;
import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Dimension;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Supplier;
import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.FontManager;
import net.runelite.client.ui.PluginPanel;

/**
 * The sidebar.
 * <p>
 * Three screens behind one panel: the list of challenges this account is in, the form for making one,
 * and one challenge open. A sidebar is too narrow to show more than one at a time, and tabs across the
 * top would spend a quarter of the width saying which of three things you are looking at.
 * <p>
 * Every call to the service happens on the executor and comes back through the EDT. A request on the
 * client thread freezes the game, and a request on the EDT freezes the panel while it waits.
 */
@Singleton
public class BotwPanel extends PluginPanel
{
	private final ChallengeStore challenges;
	private final BossDrops bossDrops;
	private final BotwApi api;
	private final BotwConfig config;
	private final ItemManager itemManager;
	private final ScheduledExecutorService executor;
	private final EventSender sender;

	/** The logged-in name, which is who points are reported as. Null until logged in. */
	private Supplier<String> playerName = () -> null;

	private final JPanel content = new JPanel();

	@Inject
	private BotwPanel(
		ChallengeStore challenges,
		BossDrops bossDrops,
		BotwApi api,
		BotwConfig config,
		ItemManager itemManager,
		ScheduledExecutorService executor,
		EventSender sender)
	{
		super(false);

		this.challenges = challenges;
		this.bossDrops = bossDrops;
		this.api = api;
		this.config = config;
		this.itemManager = itemManager;
		this.executor = executor;
		this.sender = sender;

		setLayout(new BorderLayout());
		setBackground(ColorScheme.DARK_GRAY_COLOR);

		content.setLayout(new BorderLayout());
		content.setBackground(ColorScheme.DARK_GRAY_COLOR);

		JScrollPane scroll = new JScrollPane(
			content, JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED, JScrollPane.HORIZONTAL_SCROLLBAR_NEVER);
		scroll.setBorder(BorderFactory.createEmptyBorder(8, 8, 8, 8));
		scroll.getVerticalScrollBar().setUnitIncrement(16);
		scroll.getViewport().setBackground(ColorScheme.DARK_GRAY_COLOR);
		add(scroll, BorderLayout.CENTER);

		showList();
	}

	public void setPlayerName(Supplier<String> playerName)
	{
		this.playerName = playerName;
	}

	/**
	 * Called after points have been sent, so an open leaderboard catches up without the player pressing
	 * anything. Only refreshes the list, because reloading a form under someone's hands would lose what
	 * they had typed.
	 */
	public void onPointsSent()
	{
		SwingUtilities.invokeLater(() ->
		{
			if (content.getComponentCount() > 0 && content.getComponent(0) instanceof ListView)
			{
				showList();
			}
		});
	}

	private void show(JPanel screen)
	{
		content.removeAll();
		content.add(screen, BorderLayout.NORTH);
		content.revalidate();
		content.repaint();
	}

	/** Marker so {@link #onPointsSent()} can tell which screen is up without tracking state. */
	private static class ListView extends JPanel
	{
	}

	private void showList()
	{
		ListView list = new ListView();
		list.setLayout(new BoxLayout(list, BoxLayout.Y_AXIS));
		list.setBackground(ColorScheme.DARK_GRAY_COLOR);

		JLabel heading = new JLabel("Boss of the Week");
		heading.setFont(FontManager.getRunescapeBoldFont());
		heading.setForeground(ColorScheme.BRAND_ORANGE);
		heading.setAlignmentX(Component.LEFT_ALIGNMENT);
		list.add(heading);
		list.add(Cards.gap(8));

		JButton create = Cards.button("Create a challenge");
		create.setMaximumSize(new Dimension(Integer.MAX_VALUE, 26));
		create.addActionListener(event -> showCreate());
		list.add(create);

		list.add(Cards.gap(4));
		list.add(joinRow());
		list.add(Cards.gap(10));

		List<ChallengeStore.Membership> mine = new ArrayList<>(challenges.all());
		if (mine.isEmpty())
		{
			list.add(Cards.muted("Nothing yet. Make a challenge, or paste a code to join one."));
		}
		else
		{
			list.add(Cards.sectionLabel("Your challenges"));
			for (ChallengeStore.Membership membership : mine)
			{
				list.add(Cards.gap(3));
				list.add(challengeCard(membership));
			}
		}

		show(list);
	}

	/** Joining is a code and a button, so it does not need a screen of its own. */
	private JPanel joinRow()
	{
		JPanel row = new JPanel();
		row.setLayout(new BoxLayout(row, BoxLayout.X_AXIS));
		row.setBackground(ColorScheme.DARK_GRAY_COLOR);
		row.setAlignmentX(Component.LEFT_ALIGNMENT);
		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, 26));

		JTextField code = new JTextField();
		code.setToolTipText("The code the challenge's creator gave you");
		row.add(code);
		row.add(javax.swing.Box.createHorizontalStrut(4));

		JButton join = Cards.button("Join");
		join.addActionListener(event -> join(code.getText().trim().toUpperCase()));
		row.add(join);

		return row;
	}

	private JPanel challengeCard(ChallengeStore.Membership membership)
	{
		Challenge challenge = membership.challenge;

		JPanel card = new JPanel(new BorderLayout(4, 0));
		card.setBackground(ColorScheme.DARKER_GRAY_COLOR);
		card.setBorder(BorderFactory.createEmptyBorder(6, 6, 6, 6));
		card.setAlignmentX(Component.LEFT_ALIGNMENT);

		JPanel text = new JPanel();
		text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
		text.setBackground(card.getBackground());

		JLabel name = new JLabel(challenge.getName());
		name.setFont(FontManager.getRunescapeBoldFont());
		name.setForeground(ColorScheme.LIGHT_GRAY_COLOR);
		name.setAlignmentX(Component.LEFT_ALIGNMENT);
		text.add(name);

		text.add(Cards.mutedInRow(challenge.getBoss()));
		text.add(Cards.mutedInRow(Countdown.describe(challenge, System.currentTimeMillis())));

		// Which side of the challenge this account is on, said on the card rather than only inside.
		JLabel tag = new JLabel(membership.isCreator() ? "Creator" : "Participant");
		tag.setFont(FontManager.getRunescapeSmallFont());
		tag.setForeground(membership.isCreator() ? ColorScheme.BRAND_ORANGE : Cards.mutedColor());
		tag.setAlignmentX(Component.LEFT_ALIGNMENT);
		text.add(tag);

		card.add(text, BorderLayout.CENTER);

		JButton open = Cards.button("Open");
		open.addActionListener(event -> openChallenge(challenge.getCode()));
		card.add(open, BorderLayout.EAST);

		card.setMaximumSize(new Dimension(Integer.MAX_VALUE, card.getPreferredSize().height));
		return card;
	}

	private void showCreate()
	{
		show(new CreatePanel(bossDrops, itemManager, this::create, this::showList));
	}

	private void create(Challenge challenge)
	{
		String rsn = playerName.get();
		if (rsn == null)
		{
			Cards.warn(this, "Log in first — a challenge is created under your name.");
			return;
		}

		busy("Creating…");
		executor.execute(() ->
		{
			BotwApi.Result<BotwApi.Snapshot> result = api.create(config.serverUrl(), challenge, rsn);

			SwingUtilities.invokeLater(() ->
			{
				if (!result.ok())
				{
					showList();
					Cards.warn(this, result.getError());
					return;
				}

				BotwApi.Snapshot snapshot = result.getValue();

				// A creator competes too, so both tokens are kept. Without the participant token their
				// own kills would go nowhere.
				challenges.put(
					snapshot.getChallenge(),
					snapshot.getCreatorToken(),
					snapshot.getParticipantToken());

				// The service does not hand back a participant token on create, so join immediately.
				if (snapshot.getParticipantToken() == null)
				{
					executor.execute(() -> joinQuietly(snapshot.getChallenge().getCode(), rsn));
				}

				openChallenge(snapshot.getChallenge().getCode());
			});
		});
	}

	private void join(String code)
	{
		if (code.isEmpty())
		{
			Cards.warn(this, "Paste the challenge code first.");
			return;
		}

		String rsn = playerName.get();
		if (rsn == null)
		{
			Cards.warn(this, "Log in first — you join under your own name.");
			return;
		}

		busy("Joining…");
		executor.execute(() ->
		{
			BotwApi.Result<BotwApi.Snapshot> result = api.join(config.serverUrl(), code, rsn);

			SwingUtilities.invokeLater(() ->
			{
				if (!result.ok())
				{
					showList();
					Cards.warn(this, result.getError());
					return;
				}

				BotwApi.Snapshot snapshot = result.getValue();
				challenges.put(snapshot.getChallenge(), null, snapshot.getParticipantToken());
				openChallenge(snapshot.getChallenge().getCode());
			});
		});
	}

	/** Joining the challenge you just made, without another screen about it. */
	private void joinQuietly(String code, String rsn)
	{
		BotwApi.Result<BotwApi.Snapshot> result = api.join(config.serverUrl(), code, rsn);
		if (result.ok())
		{
			SwingUtilities.invokeLater(() ->
				challenges.put(result.getValue().getChallenge(), null,
					result.getValue().getParticipantToken()));
		}
	}

	private void openChallenge(String code)
	{
		busy("Loading…");

		executor.execute(() ->
		{
			BotwApi.Result<BotwApi.Snapshot> result = api.read(config.serverUrl(), code);

			SwingUtilities.invokeLater(() ->
			{
				ChallengeStore.Membership membership = challenges.find(code);

				if (!result.ok())
				{
					// Fall back to what is stored rather than showing nothing. Someone on a train can
					// still check when their challenge ends.
					if (membership != null)
					{
						show(new ChallengeView(membership.challenge, new ArrayList<>(), playerName.get(),
							membership.isCreator(), itemManager, this::showList, () -> openChallenge(code)));
					}
					else
					{
						showList();
					}

					Cards.warn(this, result.getError());
					return;
				}

				BotwApi.Snapshot snapshot = result.getValue();
				challenges.put(snapshot.getChallenge(), null, null);

				List<LeaderboardEntry> leaderboard = snapshot.getLeaderboard();
				show(new ChallengeView(
					snapshot.getChallenge(),
					leaderboard,
					playerName.get(),
					membership != null && membership.isCreator(),
					itemManager,
					this::showList,
					() -> openChallenge(code)));
			});
		});
	}

	private void busy(String message)
	{
		JPanel waiting = new JPanel();
		waiting.setLayout(new BoxLayout(waiting, BoxLayout.Y_AXIS));
		waiting.setBackground(ColorScheme.DARK_GRAY_COLOR);
		waiting.add(Cards.muted(message));
		show(waiting);
	}
}
