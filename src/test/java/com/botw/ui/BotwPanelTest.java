package com.botw.ui;

import java.awt.BorderLayout;
import java.awt.Dimension;
import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.SwingUtilities;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class BotwPanelTest
{
	@Test
	public void scoreStaysInsideSidebarWhenVerticalScrollbarAppears() throws Exception
	{
		SwingUtilities.invokeAndWait(() ->
		{
			BotwPanel.SidebarContent content = new BotwPanel.SidebarContent();
			content.setLayout(new BorderLayout());
			content.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

			JPanel rows = new JPanel();
			rows.setLayout(new BoxLayout(rows, BoxLayout.Y_AXIS));
			rows.setPreferredSize(new Dimension(260, 720));
			JLabel firstScore = null;
			JPanel firstRow = null;
			for (int i = 0; i < 30; i++)
			{
				JPanel row = new JPanel(new BorderLayout());
				row.add(new JLabel("Cast Revelio"), BorderLayout.CENTER);
				JLabel score = new JLabel("100 pts");
				row.add(score, BorderLayout.EAST);
				row.setMaximumSize(new Dimension(Integer.MAX_VALUE, 24));
				rows.add(row);
				if (firstRow == null)
				{
					firstRow = row;
					firstScore = score;
				}
			}

			JPanel screen = new JPanel(new BorderLayout());
			screen.add(rows, BorderLayout.NORTH);
			content.add(screen, BorderLayout.NORTH);

			JScrollPane scroll = new JScrollPane(content,
				JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED, JScrollPane.HORIZONTAL_SCROLLBAR_NEVER);
			scroll.setSize(225, 180);
			scroll.doLayout();
			scroll.getViewport().doLayout();
			content.doLayout();
			screen.doLayout();
			rows.doLayout();
			firstRow.doLayout();

			assertTrue(scroll.getVerticalScrollBar().isVisible());
			assertEquals(scroll.getViewport().getWidth(), content.getWidth());
			assertTrue(firstScore.getX() + firstScore.getWidth() <= firstRow.getWidth());
		});
	}
}
