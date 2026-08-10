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
		setBackground(Theme.BACKGROUND);
		setOpaque(true);

		// PluginPanel pads itself, and that padding paints in whatever the panel's background is —
		// which is where the pale frame around everything came from. Removed here and put back inside
		// the scroll pane, so the dark goes right to the edge.
		setBorder(BorderFactory.createEmptyBorder());

		content.setLayout(new BorderLayout());
		content.setBackground(Theme.BACKGROUND);
		content.setOpaque(true);
		content.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

		JScrollPane scroll = new JScrollPane(
			content, JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED, JScrollPane.HORIZONTAL_SCROLLBAR_NEVER);
		scroll.setBorder(BorderFactory.createEmptyBorder());
		scroll.setBackground(Theme.BACKGROUND);
		scroll.setOpaque(true);
		scroll.getVerticalScrollBar().setUnitIncrement(16);
		scroll.getVerticalScrollBar().setBackground(Theme.BACKGROUND);
		scroll.getViewport().setBackground(Theme.BACKGROUND);
		scroll.getViewport().setOpaque(true);
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
		list.setBackground(Theme.BACKGROUND);

		JLabel heading = new JLabel("BOSS OF THE WEEK");
		heading.setFont(Theme.title());
		heading.setForeground(Theme.GOLD);
		heading.setAlignmentX(Component.LEFT_ALIGNMENT);
		list.add(heading);

		JLabel strapline = new JLabel("Clan challenges, counted for you");
		strapline.setFont(Theme.body());
		strapline.setForeground(Theme.TEXT_MUTED);
		strapline.setAlignmentX(Component.LEFT_ALIGNMENT);
		list.add(strapline);

		list.add(Cards.gap(12));

		list.add(new TileButton("Create a challenge", "Pick a boss and set the points", this::showCreate));
		list.add(Cards.gap(8));
		list.add(new TileButton("Join a challenge", "Enter a code from your clan", this::showJoin));

		list.add(Cards.gap(14));

		List<ChallengeStore.Membership> mine = new ArrayList<>(challenges.all());
		if (mine.isEmpty())
		{
			list.add(muted("Nothing yet. Make a challenge, or join one with a code."));
		}
		else
		{
			list.add(sectionLabel("Your challenges"));
			for (ChallengeStore.Membership membership : mine)
			{
				list.add(Cards.gap(4));
				list.add(challengeCard(membership));
			}
		}

		show(list);
	}

	/**
	 * Joining, once the tile has been pressed. A code box that is only there when it is wanted, rather
	 * than a field sitting on the front screen for the one time in twenty it gets used.
	 */
	private void showJoin()
	{
		JPanel screen = new JPanel();
		screen.setLayout(new BoxLayout(screen, BoxLayout.Y_AXIS));
		screen.setBackground(Theme.BACKGROUND);

		JLabel heading = new JLabel("JOIN A CHALLENGE");
		heading.setFont(Theme.figure(18f));
		heading.setForeground(Theme.GOLD);
		heading.setAlignmentX(Component.LEFT_ALIGNMENT);
		screen.add(heading);

		screen.add(Cards.gap(10));
		screen.add(muted("Paste the code the challenge's creator gave you."));
		screen.add(Cards.gap(8));

		JTextField code = Theme.textField(new JTextField());
		code.setAlignmentX(Component.LEFT_ALIGNMENT);
		code.setMaximumSize(new Dimension(Integer.MAX_VALUE, 34));
		code.setFont(Theme.figure(16f));
		code.setHorizontalAlignment(JTextField.CENTER);
		screen.add(code);

		screen.add(Cards.gap(10));
		screen.add(new TileButton("Join", null, () -> join(code.getText().trim().toUpperCase())));

		screen.add(Cards.gap(8));
		JButton back = Cards.button("← Back");
		back.addActionListener(event -> showList());
		screen.add(back);

		show(screen);

		// The code box is the only thing on this screen, so put the cursor in it.
		SwingUtilities.invokeLater(code::requestFocusInWindow);
	}

	private JLabel sectionLabel(String text)
	{
		JLabel label = new JLabel(text.toUpperCase());
		label.setFont(Theme.body());
		label.setForeground(Theme.TEXT_MUTED);
		label.setAlignmentX(Component.LEFT_ALIGNMENT);
		return label;
	}

	private JLabel muted(String text)
	{
		JLabel label = new JLabel("<html><body style='width:165px'>" + text + "</body></html>");
		label.setFont(Theme.body());
		label.setForeground(Theme.TEXT_MUTED);
		label.setAlignmentX(Component.LEFT_ALIGNMENT);
		return label;
	}

	private JPanel challengeCard(ChallengeStore.Membership membership)
	{
		Challenge challenge = membership.challenge;

		JPanel card = new JPanel(new BorderLayout(4, 0));
		card.setBackground(Theme.CARD);
		card.setBorder(BorderFactory.createEmptyBorder(6, 6, 6, 6));
		card.setAlignmentX(Component.LEFT_ALIGNMENT);

		JPanel text = new JPanel();
		text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
		text.setBackground(card.getBackground());

		JLabel name = new JLabel(challenge.getName());
		name.setFont(Theme.heading());
		name.setForeground(Theme.TEXT);
		name.setAlignmentX(Component.LEFT_ALIGNMENT);
		text.add(name);

		text.add(Cards.mutedInRow(challenge.getBoss()));
		text.add(Cards.mutedInRow(Countdown.describe(challenge, System.currentTimeMillis())));

		// Which side of the challenge this account is on, said on the card rather than only inside.
		// Being both is normal now: you make a challenge, then join it on the account you play.
		String role;
		if (membership.isCreator() && membership.isParticipant())
		{
			role = "CREATOR · JOINED";
		}
		else if (membership.isCreator())
		{
			role = "CREATOR · NOT JOINED";
		}
		else
		{
			role = "PARTICIPANT";
		}

		JLabel tag = new JLabel(role);
		tag.setFont(Theme.body());
		tag.setForeground(membership.isCreator() ? Theme.GOLD : Theme.TEXT_MUTED);
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

	private void showEdit(Challenge challenge)
	{
		show(new CreatePanel(bossDrops, itemManager, this::saveEdit,
			() -> openChallenge(challenge.getCode()), challenge));
	}

	private void saveEdit(Challenge challenge)
	{
		String token = challenges.creatorTokenFor(challenge.getCode());
		if (token == null)
		{
			Cards.warn(this, "Only the creator can change this challenge.");
			return;
		}

		busy("Saving…");
		executor.execute(() ->
		{
			BotwApi.Result<BotwApi.Snapshot> result =
				api.update(config.serverUrl(), challenge, token);

			SwingUtilities.invokeLater(() ->
			{
				if (!result.ok())
				{
					Cards.warn(this, result.getError());
				}
				else
				{
					challenges.put(result.getValue().getChallenge(), null, null);
				}

				openChallenge(challenge.getCode());
			});
		});
	}

	private void delete(String code)
	{
		String token = challenges.creatorTokenFor(code);
		if (token == null)
		{
			Cards.warn(this, "Only the creator can delete this challenge.");
			return;
		}

		busy("Deleting…");
		executor.execute(() ->
		{
			BotwApi.Result<BotwApi.Snapshot> result = api.delete(config.serverUrl(), code, token);

			SwingUtilities.invokeLater(() ->
			{
				if (!result.ok())
				{
					showList();
					Cards.warn(this, result.getError());
					return;
				}

				// Locally too, along with anything still waiting to be sent for it — there is nothing
				// left to send it to.
				challenges.remove(code);
				sender.forget(code);
				showList();
			});
		});
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

				// Only the creator token. Making a challenge and competing in it are separate things,
				// and joining is what a client needs to report kills — so the creator joins with the
				// code like everybody else, on whichever account they are actually playing.
				challenges.put(snapshot.getChallenge(), snapshot.getCreatorToken(), null);

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

				String creatorToken = challenges.creatorTokenFor(code);
				JPanel evidence = creatorToken == null
					? null
					: new EvidencePanel(code, snapshot.getChallenge().getName(), creatorToken,
						config.serverUrl(), api, executor, snapshot.getLeaderboard());

				Challenge open = snapshot.getChallenge();

				show(new ChallengeView(
					open,
					snapshot.getLeaderboard(),
					playerName.get(),
					membership != null && membership.isCreator(),
					itemManager,
					this::showList,
					() -> openChallenge(code),
					evidence,
					creatorToken == null ? null : () -> showEdit(open),
					creatorToken == null ? null : () -> delete(code)));
			});
		});
	}

	private void busy(String message)
	{
		JPanel waiting = new JPanel();
		waiting.setLayout(new BoxLayout(waiting, BoxLayout.Y_AXIS));
		waiting.setBackground(Theme.BACKGROUND);
		waiting.add(muted(message));
		show(waiting);
	}
}
