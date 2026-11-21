package com.botw.ui;

import java.awt.BasicStroke;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.Icon;
import javax.swing.JCheckBox;
import javax.swing.JLabel;
import javax.swing.JPanel;

/** Mobile scoring is chosen once, so keep the choice and its explanation together. */
final class MobilePlayerCard extends JPanel
{
	private final JCheckBox enabled = new JCheckBox("Use Hiscores tracking");

	MobilePlayerCard()
	{
		setLayout(new BoxLayout(this, BoxLayout.Y_AXIS));
		setBackground(Theme.CARD);
		setAlignmentX(Component.LEFT_ALIGNMENT);

		JLabel title = new JLabel("Mobile Player");
		title.setFont(Theme.figure(18f));
		title.setForeground(Theme.GOLD);
		title.setAlignmentX(Component.LEFT_ALIGNMENT);
		add(title);
		add(Cards.gap(6));

		enabled.setOpaque(false);
		enabled.setForeground(Theme.TEXT);
		enabled.setFont(Theme.heading());
		enabled.setIcon(checkboxIcon(false));
		enabled.setSelectedIcon(checkboxIcon(true));
		enabled.setIconTextGap(7);
		enabled.setAlignmentX(Component.LEFT_ALIGNMENT);
		enabled.setBorder(BorderFactory.createEmptyBorder(3, 0, 3, 0));
		enabled.getAccessibleContext().setAccessibleName("Mobile Player: use Hiscores tracking");
		enabled.addActionListener(event -> updateBorder());
		add(enabled);
		add(Cards.gap(6));
		add(note("Stats are not live. KC/XP are checked every 10 minutes. Log out or hop worlds to refresh your Hiscores."));
		add(Cards.gap(5));
		add(note("RuneLite still records firsts and screenshots. Send screenshots for drops earned on mobile."));
		add(Cards.gap(5));
		add(note("Choose when first joining. This scoring mode stays fixed for this event, including when you play on RuneLite."));
		add(Cards.gap(5));
		add(note("Hop before the event starts and finishes. Entry raids and activities without Hiscores counters are not supported."));
		updateBorder();
		setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));
	}

	boolean isSelected()
	{
		return enabled.isSelected();
	}

	private void updateBorder()
	{
		setBorder(BorderFactory.createCompoundBorder(
			BorderFactory.createLineBorder(enabled.isSelected() ? Theme.GOLD : Theme.GOLD_DIM),
			BorderFactory.createEmptyBorder(9, 9, 9, 9)));
	}

	private static JLabel note(String text)
	{
		JLabel label = new JLabel("<html><body style='width:130px'>" + text + "</body></html>");
		label.setFont(Theme.body());
		label.setForeground(Theme.TEXT_MUTED);
		label.setAlignmentX(Component.LEFT_ALIGNMENT);
		return label;
	}

	private static Icon checkboxIcon(boolean selected)
	{
		return new Icon()
		{
			@Override
			public int getIconWidth() { return 20; }

			@Override
			public int getIconHeight() { return 20; }

			@Override
			public void paintIcon(Component component, Graphics graphics, int x, int y)
			{
				Graphics2D g = Theme.smooth((Graphics2D) graphics.create());
				g.setColor(selected ? Theme.GOLD : Theme.BACKGROUND);
				g.fillRoundRect(x + 1, y + 1, 18, 18, 3, 3);
				g.setColor(Theme.GOLD);
				g.setStroke(new BasicStroke(2f));
				g.drawRoundRect(x + 1, y + 1, 18, 18, 3, 3);
				if (selected)
				{
					g.setColor(Theme.BACKGROUND);
					g.setStroke(new BasicStroke(2.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
					g.drawPolyline(new int[] { x + 5, x + 9, x + 15 }, new int[] { y + 10, y + 14, y + 6 }, 3);
				}
				g.dispose();
			}
		};
	}
}
