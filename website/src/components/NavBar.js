// src/components/NavBar.js
import React, { useContext, useEffect, useState } from 'react';
import {
  AppBar, Box, Toolbar, Button, Link,
  Avatar, Menu, IconButton, useMediaQuery,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import {
  LoginOutlined, StorageOutlined,
  AccountCircleOutlined, AccountTree,
  Logout
} from '@mui/icons-material';
import MenuIcon from '@mui/icons-material/Menu';
import useIsAdmin from '../hooks/useIsAdmin';
import useFetch from '../utils/useFetch';
import NavBarItem from './NavBarItem';
import NavMenuItem from './NavMenuItem';
import { StudentSelectionContext } from './StudentSelectionWrapper';

export default function NavBar() {
    const mobileView = useMediaQuery('(max-width:600px)');
    const [loggedIn] = useState(!!localStorage.getItem('token'));
    const { isAdmin, loading: adminLoading } = useIsAdmin();         // ← use your hook
    const { selectedStudent, setSelectedStudent } = useContext(StudentSelectionContext);

    // Fetch students only when we know isAdmin === true
    // grab the full payload, then default-stub to {}
    const { data: studentPayload = {} } = useFetch(
        isAdmin ? `/students` : null
    );
  
  // pull the array off, defaulting to an empty array
  const studentList = Array.isArray(studentPayload.students)
    ? studentPayload.students
    : [];

    // Update selection when list first arrives
    useEffect(() => {
        if (isAdmin && studentList.length) {
            // studentList is [ [name, email], … ]
            const sorted = studentList.sort((a, b) => a[0].localeCompare(b[0]));
            setSelectedStudent(sorted[0][1]);
        }
    }, [isAdmin, studentList, setSelectedStudent]);

    // Profile pic from localStorage
    const profilePic = localStorage.getItem('profilepicture') || '';

    // Menu state
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);
    const handleMenu = e => setAnchorEl(e.currentTarget);
    const handleClose = () => setAnchorEl(null);

    // Logout
    const doLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        window.location.reload();
    };

    // Tabs
    const tabs = [
        { name: 'My Grades',   href: '/' },
        { name: 'Buckets',     href: '/buckets' },
        { name: 'Concept Map', href: '/conceptmap' },
    ];

    return (
        <AppBar position="static">
            <Toolbar>
                <Box sx={{ flexGrow: 1, display: 'flex', gap: 2 }}>
                    <Link href="/" color="inherit" underline="none">
                        GradeView
                    </Link>
                    {!mobileView && tabs.map(tab =>
                        <NavBarItem key={tab.href} href={tab.href}>
                            {tab.name}
                        </NavBarItem>
                    )}
                </Box>

                {loggedIn ? (
                    <>
                        {/* only show dropdown if admin data loaded */}
                        {!adminLoading && isAdmin && (
                        <FormControl size="small" sx={{ mr: 2, minWidth: 120 }}>
                            <InputLabel>Student</InputLabel>
                            <Select
                                value={selectedStudent || ''}
                                onChange={e => setSelectedStudent(e.target.value)}
                                sx={{ bgcolor: 'white' }}
                            >
                                {studentList.map(([name, email]) => (
                                <MenuItem key={email} value={email}>
                                    {name}
                                </MenuItem>
                                ))}
                            </Select>
                            </FormControl>
                        )}

                        <IconButton onClick={handleMenu} color="inherit">
                            <Avatar src={profilePic} slotProps={{ img: { referrerPolicy: 'no-referrer' } }}/>
            </IconButton>
            <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
              {mobileView && tabs.map(tab =>
                <NavMenuItem
                  key={tab.href}
                  icon={
                    tab.href === '/' ? <AccountCircleOutlined/> :
                    tab.href === '/buckets' ? <StorageOutlined/> :
                    <AccountTree/>
                  }
                  text={tab.name}
                  onClick={() => window.location.href = tab.href}
                />
              )}
              <NavMenuItem icon={<Logout/>} text="Logout" onClick={doLogout}/>
            </Menu>
          </>
        ) : (
          mobileView ? (
            <>
              <IconButton onClick={handleMenu} color="inherit">
                <MenuIcon/>
              </IconButton>
              <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
                <NavMenuItem
                  icon={<LoginOutlined/>}
                  text="Login"
                  onClick={() => window.location.href = '/login'}
                />
                {tabs.map(tab =>
                  <NavMenuItem
                    key={tab.href}
                    icon={
                      tab.href === '/' ? <AccountCircleOutlined/> :
                      tab.href === '/buckets' ? <StorageOutlined/> :
                      <AccountTree/>
                    }
                    text={tab.name}
                    onClick={() => window.location.href = tab.href}
                  />
                )}
              </Menu>
            </>
          ) : (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<LoginOutlined/>}
              href="/login"
            >
              Login
            </Button>
          )
        )}
      </Toolbar>
    </AppBar>
  );
}
